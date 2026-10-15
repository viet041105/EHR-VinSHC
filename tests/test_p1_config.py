"""Static regression checks for the P1 administration implementation."""
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
JAVA = ROOT / "infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc"


class P1ConfigurationTests(unittest.TestCase):
    def test_new_java_sources_are_real_multiline_sources(self):
        paths = [
            JAVA / "service/DirectoryService.java",
            JAVA / "service/FormWorkflowService.java",
            JAVA / "service/StaffAccountService.java",
            JAVA / "web/DirectoryController.java",
            JAVA / "web/FormWorkflowController.java",
            JAVA / "web/StaffAccountController.java",
        ]
        for path in paths:
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                self.assertGreater(len(text.splitlines()), 40)
                self.assertIn("\npackage org.openmrs.module.vinshc", text)

    def test_no_forced_first_login_password_change(self):
        # Clinic policy: an account works with the password the admin set (6+ characters, no
        # character-class rules); self-service change stays available.
        authorization = (JAVA / "service/AuthorizationService.java").read_text(encoding="utf-8")
        accounts = (JAVA / "service/StaffAccountService.java").read_text(encoding="utf-8")
        controller = (JAVA / "web/StaffAccountController.java").read_text(encoding="utf-8")
        security = (ROOT / "infra/backend/configuration/globalproperties/vinshc/security.xml").read_text(encoding="utf-8")
        self.assertNotIn("Password change required", authorization)
        self.assertNotIn('FORCE_PASSWORD_PROPERTY, "true"', accounts)
        self.assertIn("password.length() < 6", accounts)
        self.assertRegex(security, r"<property>security.passwordMinimumLength</property>\s*<value>6</value>")
        self.assertIn("changeOwnPassword", accounts)
        self.assertIn('@PostMapping("/me/password")', controller)
        self.assertNotIn('result.put("password"', accounts)
        self.assertNotIn('result.put("salt"', accounts)

    def test_ci_runs_p1_before_and_after_persistence_boundaries(self):
        workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        self.assertIn("tests.integration.test_p1_admin", workflow)
        self.assertGreaterEqual(workflow.count("tests.integration.test_p1_persistence"), 2)


if __name__ == "__main__":
    unittest.main()
