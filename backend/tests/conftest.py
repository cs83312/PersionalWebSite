import pytest

from settings import Settings


@pytest.fixture
def settings(tmp_path):
    return Settings(_env_file=None, admin_api_key="test-admin-key-0123456789", upload_dir=tmp_path / "uploads")
