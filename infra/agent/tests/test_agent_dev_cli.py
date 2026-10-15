"""Terminal client against an actual local HTTP agent, with synthetic records and an offline model."""
from __future__ import annotations

from pathlib import Path
import socket
import subprocess
import sys
import threading
import time

import pytest
import uvicorn

from vinshc_agent.app import create_app
from vinshc_agent.config import Settings

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(scope='module')
def mock_port():
    listener = socket.socket()
    listener.bind(('127.0.0.1', 0))
    port = listener.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(create_app(Settings(data_provider='mock', rate_limit_per_minute=100)), log_level='error', access_log=False))
    thread = threading.Thread(target=server.run, kwargs={'sockets': [listener]}, daemon=True)
    thread.start()
    try:
        for _ in range(100):
            if server.started:
                break
            time.sleep(.05)
        assert server.started
        yield port
    finally:
        server.should_exit = True
        thread.join(timeout=5)
        listener.close()
        assert not thread.is_alive()


@pytest.mark.parametrize('args,question,expected', [
    ([], 'Sinh hiệu?', '120 mmHg'),
    (['--case', '2'], 'Tóm tắt lần khám', 'Thông tin thiếu/chưa đọc được:'),
    (['--persona', 'patient'], 'Lời dặn?', 'Nguồn: Lời dặn'),
    (['--case', '3'], 'Tóm tắt lần khám', 'HTTP 403:'),
])
def test_terminal_chat_uses_selected_identity_and_case(mock_port, args, question, expected):
    result = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'agent_dev.py'), 'chat', '--port', str(mock_port), *args],
                            input=question + '\n/quit\n', capture_output=True, text=True, encoding='utf-8', timeout=20)
    assert result.returncode == 0, result.stderr
    assert 'Model: fake · Dữ liệu: giả lập' in result.stdout
    assert expected in result.stdout
