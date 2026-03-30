from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
import subprocess
from threading import Lock
from typing import Dict, List
from urllib import request as urlrequest
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class SubtitleLine:
    line_id: str
    expected_text: str
    start_ms: int
    end_ms: int


@dataclass(frozen=True)
class Video:
    video_id: str
    title: str
    description: str
    demo_video_url: str
    poster_url: str
    subtitles: List[SubtitleLine]


@dataclass
class DubbingAttempt:
    attempt_id: str
    user_id: str
    video_id: str
    total_score: float
    line_results: List[dict]
    created_at: datetime


@dataclass
class LeaderboardEntryStore:
    video_id: str
    user_id: str
    best_score: float
    best_attempt_id: str
    updated_at: datetime


@dataclass
class PkInvitationStore:
    invitation_id: str
    video_id: str
    inviter_user_id: str
    share_code: str
    participants: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class AudioLineUploadStore:
    upload_id: str
    user_id: str
    video_id: str
    line_id: str
    file_name: str
    file_size: int
    file_path: str
    transcript: str
    created_at: datetime


@dataclass
class RenderedVideoStore:
    render_id: str
    user_id: str
    video_id: str
    output_path: str
    created_at: datetime


class DubbingLineSubmission(BaseModel):
    line_id: str
    spoken_text: str = ""


class SubmitDubbingRequest(BaseModel):
    user_id: str = Field(min_length=1)
    video_id: str = Field(min_length=1)
    lines: List[DubbingLineSubmission]


class CreateInvitationRequest(BaseModel):
    user_id: str = Field(min_length=1)
    video_id: str = Field(min_length=1)


class JoinInvitationRequest(BaseModel):
    user_id: str = Field(min_length=1)


class RenderVideoRequest(BaseModel):
    user_id: str = Field(min_length=1)
    video_id: str = Field(min_length=1)


class InMemoryStore:
    def __init__(self) -> None:
        self.videos: Dict[str, Video] = self._seed_videos()
        self.attempts: Dict[str, DubbingAttempt] = {}
        self.leaderboard: Dict[tuple[str, str], LeaderboardEntryStore] = {}
        self.invitations: Dict[str, PkInvitationStore] = {}
        self.audio_line_uploads: Dict[str, AudioLineUploadStore] = {}
        self.rendered_videos: Dict[str, RenderedVideoStore] = {}
        self.lock = Lock()

    @staticmethod
    def _seed_videos() -> Dict[str, Video]:
        return {
            "video_001": Video(
                video_id="video_001",
                title="经典对白：逆风翻盘",
                description="两人对话情绪起伏较大，适合练习表达。",
                demo_video_url="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
                poster_url="https://dummyimage.com/640x360/222/fff&text=video_001",
                subtitles=[
                    SubtitleLine(
                        line_id="l1",
                        expected_text="这一次我不会再退缩",
                        start_ms=1000,
                        end_ms=3800,
                    ),
                    SubtitleLine(
                        line_id="l2",
                        expected_text="就算逆风也要打出气势",
                        start_ms=4200,
                        end_ms=7000,
                    ),
                    SubtitleLine(
                        line_id="l3",
                        expected_text="我们一定能赢",
                        start_ms=7600,
                        end_ms=9000,
                    ),
                ],
            ),
            "video_002": Video(
                video_id="video_002",
                title="轻喜剧：下班前一分钟",
                description="语速快，适合挑战节奏和停顿。",
                demo_video_url="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
                poster_url="https://dummyimage.com/640x360/111/fff&text=video_002",
                subtitles=[
                    SubtitleLine(
                        line_id="l1",
                        expected_text="你先别走我还有一句话",
                        start_ms=500,
                        end_ms=2800,
                    ),
                    SubtitleLine(
                        line_id="l2",
                        expected_text="这份方案今晚必须发",
                        start_ms=3000,
                        end_ms=5200,
                    ),
                ],
            ),
        }


store = InMemoryStore()
app = FastAPI(
    title="微信视频配音 PK MVP API",
    description="支持配音评分、PK 邀请、视频排行榜的最小可用后端。",
    version="0.1.0",
)

ARTIFACTS_DIR = Path(__file__).resolve().parent.parent / "_artifacts"
AUDIO_UPLOAD_DIR = ARTIFACTS_DIR / "audio_uploads"
VIDEO_CACHE_DIR = ARTIFACTS_DIR / "video_cache"
RENDERED_VIDEO_DIR = ARTIFACTS_DIR / "rendered_videos"


def ensure_artifact_dirs() -> None:
    AUDIO_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    VIDEO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    RENDERED_VIDEO_DIR.mkdir(parents=True, exist_ok=True)


ensure_artifact_dirs()


def ensure_ffmpeg_available() -> None:
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        raise HTTPException(
            status_code=500,
            detail="ffmpeg is not available on server",
        ) from exc


def download_if_needed(url: str, target_path: Path) -> Path:
    if target_path.exists():
        return target_path
    target_path.parent.mkdir(parents=True, exist_ok=True)
    urlrequest.urlretrieve(url, target_path)  # nosec B310, MVP sample usage
    return target_path


def run_ffmpeg_command(command: List[str]) -> None:
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        error_message = exc.stderr.strip() or "ffmpeg command failed"
        raise HTTPException(status_code=500, detail=error_message) from exc


def probe_video_duration_seconds(video_path: Path) -> float:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(video_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return max(float(result.stdout.strip()), 0.1)
    except (subprocess.CalledProcessError, ValueError) as exc:
        raise HTTPException(status_code=500, detail="failed to probe video duration") from exc


def render_user_dubbing_video(user_id: str, video: Video, render_id: str) -> Path:
    ensure_ffmpeg_available()

    user_uploads = [
        upload
        for upload in store.audio_line_uploads.values()
        if upload.user_id == user_id and upload.video_id == video.video_id
    ]
    if not user_uploads:
        raise HTTPException(status_code=400, detail="No uploaded audio lines for this user/video")

    latest_by_line: Dict[str, AudioLineUploadStore] = {}
    for upload in user_uploads:
        prev = latest_by_line.get(upload.line_id)
        if prev is None or upload.created_at > prev.created_at:
            latest_by_line[upload.line_id] = upload

    missing_lines = [
        subtitle.line_id
        for subtitle in video.subtitles
        if subtitle.line_id not in latest_by_line
    ]
    if missing_lines:
        raise HTTPException(
            status_code=400,
            detail=f"Missing uploaded lines: {', '.join(missing_lines)}",
        )

    source_video_path = VIDEO_CACHE_DIR / f"{video.video_id}.mp4"
    try:
        if video.demo_video_url.startswith(("http://", "https://", "file://")):
            source_video_path = download_if_needed(video.demo_video_url, source_video_path)
        else:
            local_path = Path(video.demo_video_url)
            if not local_path.exists():
                raise FileNotFoundError(local_path)
            source_video_path = local_path
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="failed to fetch source video") from exc

    video_duration = probe_video_duration_seconds(source_video_path)
    output_path = RENDERED_VIDEO_DIR / f"{render_id}.mp4"

    audio_input_paths: List[Path] = []
    for subtitle in video.subtitles:
        upload = latest_by_line[subtitle.line_id]
        upload_path = Path(upload.file_path)
        if not upload_path.exists():
            raise HTTPException(
                status_code=400,
                detail=f"Audio file missing for line {subtitle.line_id}",
            )
        audio_input_paths.append(upload_path)

    ffmpeg_command = [
        "ffmpeg",
        "-y",
        "-i",
        str(source_video_path),
        "-f",
        "lavfi",
        "-t",
        f"{video_duration:.3f}",
        "-i",
        "anullsrc=r=16000:cl=mono",
    ]
    for audio_path in audio_input_paths:
        ffmpeg_command.extend(["-i", str(audio_path)])

    filter_parts: List[str] = ["[1:a]volume=1[a0]"]
    mix_labels = ["[a0]"]
    for index, subtitle in enumerate(video.subtitles, start=2):
        delay_ms = max(subtitle.start_ms, 0)
        label = f"a{index - 1}"
        filter_parts.append(
            f"[{index}:a]adelay={delay_ms}|{delay_ms},volume=1[{label}]"
        )
        mix_labels.append(f"[{label}]")

    filter_parts.append(
        f"{''.join(mix_labels)}amix=inputs={len(mix_labels)}:normalize=0[mix]"
    )
    ffmpeg_command.extend(
        [
            "-filter_complex",
            ";".join(filter_parts),
            "-map",
            "0:v:0",
            "-map",
            "[mix]",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
    )
    run_ffmpeg_command(ffmpeg_command)
    return output_path


def compute_line_score(expected_text: str, spoken_text: str) -> float:
    ratio = SequenceMatcher(a=expected_text.strip(), b=spoken_text.strip()).ratio()
    return round(ratio * 100, 2)


def get_subtitle_line(video: Video, line_id: str) -> SubtitleLine | None:
    return next((line for line in video.subtitles if line.line_id == line_id), None)


def simulate_asr_transcript(expected_text: str, file_size: int) -> str:
    """
    Deterministic ASR mock based on file size, useful for MVP integration.
    """
    if not expected_text:
        return ""

    mode = file_size % 4
    if mode == 0:
        return expected_text
    if mode == 1 and len(expected_text) > 1:
        return expected_text[:-1]
    if mode == 2:
        return f"{expected_text}!"
    if mode == 3 and len(expected_text) > 2:
        return f"{expected_text[1:]}{expected_text[0]}"
    return expected_text


def serialize_video(video: Video) -> dict:
    return {
        "video_id": video.video_id,
        "title": video.title,
        "description": video.description,
        "demo_video_url": video.demo_video_url,
        "poster_url": video.poster_url,
        "subtitles": [
            {
                "line_id": line.line_id,
                "expected_text": line.expected_text,
                "start_ms": line.start_ms,
                "end_ms": line.end_ms,
            }
            for line in video.subtitles
        ],
    }


def serialize_leaderboard_entry(entry: LeaderboardEntryStore) -> dict:
    return {
        "video_id": entry.video_id,
        "user_id": entry.user_id,
        "best_score": entry.best_score,
        "best_attempt_id": entry.best_attempt_id,
        "updated_at": entry.updated_at.isoformat(),
    }


def serialize_invitation(invitation: PkInvitationStore) -> dict:
    return {
        "invitation_id": invitation.invitation_id,
        "video_id": invitation.video_id,
        "inviter_user_id": invitation.inviter_user_id,
        "share_code": invitation.share_code,
        "participants": invitation.participants,
        "created_at": invitation.created_at.isoformat(),
    }


def sorted_leaderboard(video_id: str) -> List[LeaderboardEntryStore]:
    items = [
        value
        for key, value in store.leaderboard.items()
        if key[0] == video_id
    ]
    items.sort(
        key=lambda e: (
            -e.best_score,
            e.updated_at,
            e.user_id,
        )
    )
    return items


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/videos")
def list_videos() -> dict:
    return {"items": [serialize_video(video) for video in store.videos.values()]}


@app.get("/videos/{video_id}")
def get_video(video_id: str) -> dict:
    video = store.videos.get(video_id)
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    return serialize_video(video)


@app.get("/videos/{video_id}/leaderboard")
def get_video_leaderboard(video_id: str, limit: int = 20) -> dict:
    if video_id not in store.videos:
        raise HTTPException(status_code=404, detail="Video not found")
    entries = sorted_leaderboard(video_id)[: max(1, min(limit, 100))]
    return {"video_id": video_id, "items": [serialize_leaderboard_entry(e) for e in entries]}


@app.post("/dubbings/submit")
def submit_dubbing(payload: SubmitDubbingRequest) -> dict:
    video = store.videos.get(payload.video_id)
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")

    spoken_by_line = {line.line_id: line.spoken_text for line in payload.lines}
    line_results: List[dict] = []
    for subtitle in video.subtitles:
        spoken_text = spoken_by_line.get(subtitle.line_id, "")
        score = compute_line_score(subtitle.expected_text, spoken_text)
        line_results.append(
            {
                "line_id": subtitle.line_id,
                "expected_text": subtitle.expected_text,
                "spoken_text": spoken_text,
                "score": score,
            }
        )

    total_score = round(
        sum(result["score"] for result in line_results) / len(video.subtitles),
        2,
    )
    created_at = utc_now()
    attempt_id = str(uuid4())
    attempt = DubbingAttempt(
        attempt_id=attempt_id,
        user_id=payload.user_id,
        video_id=payload.video_id,
        total_score=total_score,
        line_results=line_results,
        created_at=created_at,
    )

    leaderboard_key = (payload.video_id, payload.user_id)
    with store.lock:
        store.attempts[attempt_id] = attempt
        old_entry = store.leaderboard.get(leaderboard_key)
        is_new_personal_best = old_entry is None or total_score > old_entry.best_score
        if is_new_personal_best:
            store.leaderboard[leaderboard_key] = LeaderboardEntryStore(
                video_id=payload.video_id,
                user_id=payload.user_id,
                best_score=total_score,
                best_attempt_id=attempt_id,
                updated_at=created_at,
            )

    rank_list = sorted_leaderboard(payload.video_id)
    rank = next(
        (index + 1 for index, item in enumerate(rank_list) if item.user_id == payload.user_id),
        None,
    )

    return {
        "attempt_id": attempt_id,
        "video_id": payload.video_id,
        "user_id": payload.user_id,
        "line_results": line_results,
        "total_score": total_score,
        "is_new_personal_best": is_new_personal_best,
        "current_rank": rank,
        "created_at": created_at.isoformat(),
    }


@app.post("/dubbings/audio-lines/upload")
async def upload_audio_line(
    user_id: str = Form(...),
    video_id: str = Form(...),
    line_id: str = Form(...),
    audio_file: UploadFile = File(...),
) -> dict:
    video = store.videos.get(video_id)
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")

    subtitle = get_subtitle_line(video, line_id)
    if subtitle is None:
        raise HTTPException(status_code=404, detail="Subtitle line not found")

    content = await audio_file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Audio file is empty")

    created_at = utc_now()
    transcript = simulate_asr_transcript(subtitle.expected_text, len(content))
    line_score = compute_line_score(subtitle.expected_text, transcript)
    upload_id = str(uuid4())

    file_name = audio_file.filename or "unknown_audio"
    line_upload_dir = AUDIO_UPLOAD_DIR / user_id / video_id
    line_upload_dir.mkdir(parents=True, exist_ok=True)
    extension = Path(file_name).suffix or ".mp3"
    file_path = line_upload_dir / f"{line_id}_{upload_id}{extension}"
    file_path.write_bytes(content)

    with store.lock:
        store.audio_line_uploads[upload_id] = AudioLineUploadStore(
            upload_id=upload_id,
            user_id=user_id,
            video_id=video_id,
            line_id=line_id,
            file_name=file_name,
            file_size=len(content),
            file_path=str(file_path),
            transcript=transcript,
            created_at=created_at,
        )

    return {
        "upload_id": upload_id,
        "user_id": user_id,
        "video_id": video_id,
        "line_id": line_id,
        "file_name": file_name,
        "file_size": len(content),
        "transcript": transcript,
        "line_score": line_score,
        "created_at": created_at.isoformat(),
    }


@app.post("/dubbings/render")
def render_dubbing_video(payload: RenderVideoRequest) -> dict:
    video = store.videos.get(payload.video_id)
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")

    render_id = str(uuid4())
    output_path = render_user_dubbing_video(payload.user_id, video, render_id)
    created_at = utc_now()

    with store.lock:
        store.rendered_videos[render_id] = RenderedVideoStore(
            render_id=render_id,
            user_id=payload.user_id,
            video_id=payload.video_id,
            output_path=str(output_path),
            created_at=created_at,
        )

    return {
        "render_id": render_id,
        "video_id": payload.video_id,
        "user_id": payload.user_id,
        "download_url": f"/dubbings/render/{render_id}/download",
        "created_at": created_at.isoformat(),
    }


@app.get("/dubbings/render/{render_id}/download")
def download_rendered_video(render_id: str) -> FileResponse:
    rendered = store.rendered_videos.get(render_id)
    if rendered is None:
        raise HTTPException(status_code=404, detail="Rendered video not found")

    output_path = Path(rendered.output_path)
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Rendered video file missing")

    return FileResponse(
        path=output_path,
        media_type="video/mp4",
        filename=f"{render_id}.mp4",
    )


@app.post("/pk/invitations")
def create_pk_invitation(payload: CreateInvitationRequest) -> dict:
    if payload.video_id not in store.videos:
        raise HTTPException(status_code=404, detail="Video not found")

    invitation_id = str(uuid4())
    share_code = uuid4().hex[:8].upper()
    invitation = PkInvitationStore(
        invitation_id=invitation_id,
        video_id=payload.video_id,
        inviter_user_id=payload.user_id,
        share_code=share_code,
        participants=[payload.user_id],
    )
    with store.lock:
        store.invitations[share_code] = invitation

    return serialize_invitation(invitation)


@app.get("/pk/invitations/{share_code}")
def get_pk_invitation(share_code: str) -> dict:
    normalized_share_code = share_code.strip().upper()
    invitation = store.invitations.get(normalized_share_code)
    if invitation is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    return serialize_invitation(invitation)


@app.post("/pk/invitations/{share_code}/join")
def join_pk_invitation(share_code: str, payload: JoinInvitationRequest) -> dict:
    normalized_share_code = share_code.strip().upper()
    invitation = store.invitations.get(normalized_share_code)
    if invitation is None:
        raise HTTPException(status_code=404, detail="Invitation not found")

    with store.lock:
        if payload.user_id not in invitation.participants:
            invitation.participants.append(payload.user_id)

    return {
        "invitation_id": invitation.invitation_id,
        "video_id": invitation.video_id,
        "share_code": invitation.share_code,
        "participants": invitation.participants,
    }
