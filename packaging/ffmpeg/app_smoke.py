"""Test the packaged local manager in disposable data on isolated ports."""
import json
import os
import pathlib
import subprocess
import time
import urllib.request


def check_manager(root, scratch, windows):
    root = pathlib.Path(root).resolve()
    scratch = pathlib.Path(scratch).resolve()
    scratch.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, MTX_MANAGER_DATA=str(scratch), MTX_LAUNCHER_PORT='18960',
        MTX_WORKER_PORT='18961', MTX_SHARING_PORT='18962', MTX_API_PORT='20997',
        MTX_RTSP_PORT='19554', MTX_HLS_PORT='19888', MTX_PLAYBACK_PORT='20996',
        MTX_LAUNCHER_NO_BROWSER='1')
    node = root / 'runtime' / ('node.exe' if windows else 'node')
    log_file = scratch / 'manager.log'
    base = 'http://127.0.0.1:18960/api/'
    token = None

    def get(route):
        return json.load(urllib.request.urlopen(base + route, timeout=5))

    def wait(test):
        for _ in range(120):
            try:
                result = test()
                if result:
                    return result
            except Exception:
                pass
            time.sleep(0.25)
        raise RuntimeError('Packaged manager check timed out')

    def post(route, body=None):
        request = urllib.request.Request(base + route, data=json.dumps(body or {}).encode(),
            headers={'Content-Type': 'application/json', 'X-Manager-Token': token}, method='POST')
        return json.load(urllib.request.urlopen(request, timeout=25))

    with log_file.open('wb') as log:
        child = subprocess.Popen([str(node), str(root / 'launcher.mjs')], env=env, cwd=str(root),
            stdout=log, stderr=subprocess.STDOUT)
        try:
            bootstrap = wait(lambda: get('bootstrap'))
            token = bootstrap['token']
            wait(lambda: get('state')['server']['running'])
            state = post('sample/start')
            camera = next(c for c in state['cameras'] if c['kind'] == 'sample')
            wait(lambda: any(c['id'] == camera['id'] and c['status'] == 'Live' for c in get('state')['cameras']))
            post('cameras/' + camera['id'] + '/record', {'record': True})
            time.sleep(7)
            post('cameras/' + camera['id'] + '/record', {'record': False})
            recordings = wait(lambda: [f for f in get('recordings')['items'] if f['size'] > 10000])
            assert recordings
            post('shutdown')
            wait(lambda: not get('bootstrap')['managerRunning'])
            assert urllib.request.urlopen('http://127.0.0.1:18960/', timeout=5).status == 200
            post('manager/start')
            wait(lambda: get('bootstrap')['managerRunning'] and get('state')['server']['running'])
            wait(lambda: any(c['id'] == camera['id'] and c['status'] == 'Live' for c in get('state')['cameras']))
            print('PASS: packaged manager sample, real MP4 recording, retained page and Quit/Start', flush=True)
            return {'passed': ['packaged Node/MediaMTX/FFmpeg startup', '1280x720 sample live',
                'actual MP4 recording', 'page retained after Quit', 'Start reconnects saved sample'],
                'desktopGUI': 'Not exercised by this backend test', 'physicalCamera': 'Not used in CI'}
        except Exception:
            log.flush()
            print(log_file.read_text(errors='replace')[-6000:])
            raise
        finally:
            if token:
                try:
                    post('shutdown')
                    wait(lambda: not get('bootstrap')['managerRunning'])
                    post('launcher/exit')
                except Exception:
                    pass
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.terminate()
                child.wait(timeout=10)
