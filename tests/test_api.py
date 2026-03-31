from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_list_videos() -> None:
    response = client.get("/videos")
    assert response.status_code == 200
    payload = response.json()
    assert "items" in payload
    assert len(payload["items"]) >= 1


def test_submit_dubbing_updates_personal_best_and_leaderboard() -> None:
    submit_response = client.post(
        "/dubbings/submit",
        json={
            "user_id": "u1",
            "video_id": "video_001",
            "lines": [
                {"line_id": "l1", "spoken_text": "这一次我不会再退缩"},
                {"line_id": "l2", "spoken_text": "就算逆风也要打出气势"},
                {"line_id": "l3", "spoken_text": "我们一定能赢"},
            ],
        },
    )
    assert submit_response.status_code == 200
    result = submit_response.json()
    assert result["is_new_personal_best"] is True
    assert result["total_score"] == 100.0
    assert result["current_rank"] == 1

    board_response = client.get("/videos/video_001/leaderboard")
    assert board_response.status_code == 200
    board = board_response.json()["items"]
    assert len(board) >= 1
    assert board[0]["user_id"] == "u1"
    assert board[0]["best_score"] == 100.0


def test_pk_create_and_join() -> None:
    create_response = client.post(
        "/pk/invitations",
        json={"user_id": "u_inviter", "video_id": "video_001"},
    )
    assert create_response.status_code == 200
    invitation = create_response.json()
    share_code = invitation["share_code"]
    assert invitation["participants"] == ["u_inviter"]

    join_response = client.post(
        f"/pk/invitations/{share_code}/join",
        json={"user_id": "u_friend"},
    )
    assert join_response.status_code == 200
    joined = join_response.json()
    assert set(joined["participants"]) == {"u_inviter", "u_friend"}


def test_pk_invitation_query_is_case_insensitive() -> None:
    create_response = client.post(
        "/pk/invitations",
        json={"user_id": "u_case", "video_id": "video_001"},
    )
    assert create_response.status_code == 200
    invitation = create_response.json()
    lower_code = invitation["share_code"].lower()

    get_response = client.get(f"/pk/invitations/{lower_code}")
    assert get_response.status_code == 200
    queried = get_response.json()
    assert queried["share_code"] == invitation["share_code"]
    assert queried["video_id"] == "video_001"


def test_audio_line_upload_returns_mock_transcript_and_score() -> None:
    response = client.post(
        "/dubbings/audio-lines/upload",
        data={
            "user_id": "u_audio",
            "video_id": "video_001",
            "line_id": "l1",
        },
        files={"audio_file": ("line1.wav", b"1234567890", "audio/wav")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["user_id"] == "u_audio"
    assert payload["video_id"] == "video_001"
    assert payload["line_id"] == "l1"
    assert payload["file_name"] == "line1.wav"
    assert payload["file_size"] == 10
    assert payload["transcript"]
    assert 0 <= payload["line_score"] <= 100


def test_audio_line_upload_rejects_empty_file() -> None:
    response = client.post(
        "/dubbings/audio-lines/upload",
        data={
            "user_id": "u_audio",
            "video_id": "video_001",
            "line_id": "l1",
        },
        files={"audio_file": ("line1.wav", b"", "audio/wav")},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Audio file is empty"


def test_render_requires_uploaded_lines() -> None:
    response = client.post(
        "/dubbings/render",
        json={"user_id": "u_render_no_audio", "video_id": "video_001"},
    )
    assert response.status_code == 400
    assert "No uploaded audio lines" in response.json()["detail"]


def test_render_returns_400_when_lines_incomplete() -> None:
    upload_response = client.post(
        "/dubbings/audio-lines/upload",
        data={
            "user_id": "u_render_partial",
            "video_id": "video_001",
            "line_id": "l1",
        },
        files={"audio_file": ("line1.wav", b"abc123", "audio/wav")},
    )
    assert upload_response.status_code == 200

    render_response = client.post(
        "/dubbings/render",
        json={"user_id": "u_render_partial", "video_id": "video_001"},
    )
    assert render_response.status_code == 400
    assert "Missing uploaded lines" in render_response.json()["detail"]
