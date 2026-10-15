"""One command to run agent tests and the synthetic advanced baseline."""
from __future__ import annotations
import argparse
import os
import logging
from pathlib import Path
import sys

from agent_dev import PYTHON, ROOT, run


def main():
    if PYTHON.is_file() and Path(sys.executable).resolve() != PYTHON.resolve():
        return run([str(PYTHON),str(Path(__file__).resolve()),*sys.argv[1:]])
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError,ValueError):
        pass
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-tests",action="store_true")
    parser.add_argument("--model",choices=["fake","gemini","anthropic"],default="fake")
    parser.add_argument("--limit",type=int,help="giới hạn ca khi thử API thật; 1–24")
    parser.add_argument("--rag",choices=["offline","gemini"],default="offline")
    args=parser.parse_args()
    if not args.skip_tests:
        result=run([sys.executable,"-m","pytest",str(ROOT/"infra/agent/tests"),"-q"])
        if result:
            return result
    sys.path.insert(0,str(ROOT/"infra/agent/src"))
    from vinshc_agent.evaluate import evaluate,save_report
    from vinshc_agent.config import Settings, load_settings
    settings=Settings(knowledge_mode=args.rag)
    if args.model!='fake' or args.rag=='gemini':
        import importlib.util
        spec=importlib.util.spec_from_file_location('agent_main',ROOT/'infra/agent/src/main.py')
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.load_env_file(ROOT/'infra/agent/.env')
        os.environ.update({'VINSHC_AGENT_MODEL_PROVIDER':args.model,'VINSHC_AGENT_DATA_PROVIDER':'mock',
                           'VINSHC_AGENT_KNOWLEDGE_MODE':args.rag,'VINSHC_AGENT_KNOWLEDGE_ENABLED':'true'})
        settings=load_settings()
    if args.limit is not None and not 1<=args.limit<=24:
        parser.error('--limit cần từ 1 đến 24')
    logger=logging.getLogger('vinshc_agent')
    previous=logger.disabled
    logger.disabled=True
    try:
        report=evaluate(settings,args.limit)
    finally:
        logger.disabled=previous
    path=save_report(report,ROOT/".runtime/reports",'agent-advanced-live' if args.model!='fake' else 'agent-advanced')
    print(f"Synthetic baseline: {report['passed']}/{report['total']} cases · source coverage {report['groundedAnswers']}/{report['totalAnswers']} answers")
    print(f"Report: {path}")
    return 0 if report["passed"]==report["total"] else 1


if __name__=="__main__":
    raise SystemExit(main())
