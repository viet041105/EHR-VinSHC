"""Run the clinic and agent overlay without changing the project's database volumes."""
import argparse
import os
from pathlib import Path
import socket
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]
COMPOSE=['docker','compose','-f','compose.yaml','-f','compose.agent.yaml']
# Published ports: (env var, default, service that owns it).
PORTS=[('EHR_HTTP_PORT',8080,'gateway'),('VINSHC_APP_PORT',5173,'clinic')]
def dotenv(path):
    values={}
    if path.is_file():
        for line in path.read_text(encoding='utf-8').splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key,value=line.split('=',1)
                values[key.strip()]=value.strip()
    return values
def compose(*args,capture=False):
    return subprocess.run(COMPOSE+list(args),cwd=ROOT,check=False,text=True,encoding='utf-8',errors='replace',
                          capture_output=capture)
def port_free(port):
    with socket.socket() as probe:
        try:
            probe.bind(('127.0.0.1',port))
            return True
        except OSError:
            return False
def preflight():
    if subprocess.run(['docker','info'],capture_output=True,check=False).returncode:
        print('Docker chưa chạy: mở Docker Desktop rồi chạy lại.',file=sys.stderr)
        return False
    root_env,agent_env=dotenv(ROOT/'.env'),dotenv(ROOT/'infra'/'agent'/'.env')
    running=set(compose('ps','--status','running','--services',capture=True).stdout.split())
    ok=True
    for name,default,service in PORTS:
        port=int(os.environ.get(name) or root_env.get(name) or default)
        if service not in running and not port_free(port):
            print(f'Cổng {port} ({service}) đang bị tiến trình khác chiếm, thường là `npm run dev`. '
                  f'Tắt tiến trình đó hoặc đổi cổng: $env:{name}=<cổng khác>; npm start',file=sys.stderr)
            ok=False
    provider=agent_env.get('VINSHC_AGENT_MODEL_PROVIDER','fake').lower()
    keys={'openai':'OPENAI_API_KEY','gemini':'GEMINI_API_KEY','anthropic':'ANTHROPIC_API_KEY'}
    key=keys.get(provider)
    if key and not agent_env.get(key) and not agent_env.get(f'VINSHC_AGENT_{key}_FILE'):
        print(f'Agent dùng model {provider} nhưng infra/agent/.env chưa có {key}.',file=sys.stderr)
        ok=False
    return ok
def report_failure():
    print('\nCó service chưa healthy:',file=sys.stderr)
    states=compose('ps','-a','--format','{{.Service}}\t{{.Status}}',capture=True).stdout.strip().splitlines()
    for line in states:
        print('  '+line,file=sys.stderr)
    for line in states:
        service,_,status=line.partition('\t')
        if '(healthy)' not in status:
            print(f'\n--- log {service} ---',file=sys.stderr)
            compose('logs','--tail','20',service)
def ensure_admin_workspace():
    # A fresh database leaves the root admin without a VinSHC workspace, so the web app refuses login.
    # Only fill that gap; never replace an assignment that already exists.
    from api_client import ApiError,Client
    from common import read_settings
    settings=read_settings(ROOT)
    client=Client('http://127.0.0.1:'+settings.get('EHR_HTTP_PORT','8080'),settings['EHR_ADMIN_USERNAME'],settings['EHR_ADMIN_PASSWORD'])
    try:
        if client.json('/openmrs/ws/rest/v1/vinshc/authorization/workspaces',statuses=(200,409)):
            return
    except ApiError as error:
        print(f'Không kiểm tra được phân công của admin: {error}',file=sys.stderr)
        return
    print('Admin chưa có vai trò/cơ sở VinSHC; đang gán admin + cơ sở mặc định.')
    result=subprocess.run([sys.executable,str(ROOT/'infra'/'frontend'/'scripts'/'configure-admin.py')],
                          cwd=ROOT,check=False,env={**os.environ,'PYTHONIOENCODING':'utf-8'})
    if result.returncode:
        print('Gán quyền admin thất bại; chạy tay: python infra/frontend/scripts/configure-admin.py',file=sys.stderr)
def start(build):
    from bootstrap import bootstrap
    bootstrap(ROOT)
    if not preflight():
        return 2
    args=['up','-d','--wait','--wait-timeout','900','--remove-orphans']
    args+=['--build'] if build else ['--no-build','--pull','never']
    if compose(*args).returncode:
        report_failure()
        return 1
    ensure_admin_workspace()
    root_env=dotenv(ROOT/'.env')
    app=os.environ.get('VINSHC_APP_PORT') or root_env.get('VINSHC_APP_PORT') or 5173
    ehr=os.environ.get('EHR_HTTP_PORT') or root_env.get('EHR_HTTP_PORT') or 8080
    print(f'\nĐã chạy đủ service (db, backend, frontend, gateway, agent, clinic).')
    print(f'  Bác sĩ/nhân viên: http://127.0.0.1:{app}/connected.html')
    print(f'  Cổng bệnh nhân:   http://127.0.0.1:{app}/portal.html')
    print(f'  OpenMRS gốc:      http://127.0.0.1:{ehr}/openmrs/spa')
    print('Dừng: npm run mvp:stop (giữ dữ liệu).')
    return 0
def main():
    for stream in (sys.stdout,sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8')
        except (AttributeError,ValueError):
            pass
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['start','up','build','agent-build','model-check','status','stop','down'])
    parser.add_argument('--no-build',action='store_true',help='start: dùng image đã có, không build lại')
    args=parser.parse_args()
    if args.action=='start':
        return start(not args.no_build)
    command=list(COMPOSE)
    if args.action in ('up','build','agent-build','model-check'):
        from bootstrap import bootstrap
        bootstrap(ROOT)
        if args.action=='build':
            command+=['up','-d','--build']
        elif args.action=='agent-build':
            command+=['build','agent']
        elif args.action=='model-check':
            command+=['run','--rm','--no-deps','--pull','never','agent','python','src/main.py','--check-model']
        else:
            command+=['up','-d','--no-build','--pull','never']
    elif args.action=='status':command+=['ps']
    elif args.action=='stop':command+=['stop']
    else:command+=['down']
    return subprocess.run(command,cwd=ROOT,check=False).returncode
if __name__=='__main__':sys.exit(main())
