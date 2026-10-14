"""Run the clinic and agent overlay without changing the project's database volumes."""
import argparse
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['up','status','down'])
    args=parser.parse_args()
    command=['docker','compose','-f','compose.yaml','-f','compose.agent.yaml']
    if args.action=='up':
        from bootstrap import bootstrap
        bootstrap(ROOT)
        command+=['up','-d','--build']
    elif args.action=='status':command+=['ps']
    else:command+=['down']
    return subprocess.run(command,cwd=ROOT,check=False).returncode
if __name__=='__main__':sys.exit(main())
