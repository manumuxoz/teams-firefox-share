import importlib.util
import sys
import tempfile
import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path

DOCTOR_PATH = Path(__file__).resolve().parents[1] / "tools" / "teams-ss-doctor"
LOADER = SourceFileLoader("teams_ss_doctor", str(DOCTOR_PATH))
SPEC = importlib.util.spec_from_loader("teams_ss_doctor", LOADER)
assert SPEC
doctor = importlib.util.module_from_spec(SPEC)
sys.modules["teams_ss_doctor"] = doctor
LOADER.exec_module(doctor)


class ParsePrefsTests(unittest.TestCase):
    def test_parses_json_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            prefs = Path(tmp) / "prefs.js"
            prefs.write_text(
                'user_pref("media.webrtc.capture.allow-pipewire", true);\n'
                'user_pref("media.navigator.video.resize_mode.enabled", false);\n'
                'user_pref("media.gmp-gmpopenh264.version", "2.6.0");\n',
                encoding="utf-8",
            )

            parsed = doctor.parse_prefs(prefs)

            self.assertIs(parsed["media.webrtc.capture.allow-pipewire"], True)
            self.assertIs(parsed["media.navigator.video.resize_mode.enabled"], False)
            self.assertEqual(parsed["media.gmp-gmpopenh264.version"], "2.6.0")

    def test_ignores_comments_and_malformed_lines(self):
        with tempfile.TemporaryDirectory() as tmp:
            prefs = Path(tmp) / "prefs.js"
            prefs.write_text(
                "// comment\n"
                'user_pref("a", 1);\n'
                "not a pref\n",
                encoding="utf-8",
            )

            parsed = doctor.parse_prefs(prefs)

            self.assertEqual(parsed, {"a": 1})


class PortalFileTests(unittest.TestCase):
    def test_parses_key_value_lines(self):
        with tempfile.TemporaryDirectory() as tmp:
            portal = Path(tmp) / "hyprland.portal"
            portal.write_text(
                "[portal]\n"
                "DBusName=org.freedesktop.impl.portal.desktop.hyprland\n"
                "Interfaces=org.freedesktop.impl.portal.ScreenCast;"
                "org.freedesktop.impl.portal.Screenshot;\n"
                "UseIn=Hyprland;sway;\n",
                encoding="utf-8",
            )

            parsed = doctor.parse_portal_file(portal)

            self.assertEqual(
                parsed["DBusName"],
                "org.freedesktop.impl.portal.desktop.hyprland",
            )
            self.assertIn("ScreenCast", parsed["Interfaces"])
            self.assertEqual(parsed["UseIn"], "Hyprland;sway;")


class ScreencopyBlockTests(unittest.TestCase):
    def test_appends_block_when_missing(self):
        updated, action = doctor.insert_into_screencopy_block("", "force_shm", "true")

        self.assertEqual(action, "appended")
        self.assertIn("screencopy {", updated)
        self.assertIn("force_shm = true", updated)

    def test_inserts_into_existing_block(self):
        original = "screencopy {\n    custom_picker_binary = hyprland-share-picker\n}\n"

        updated, action = doctor.insert_into_screencopy_block(
            original, "force_shm", "true"
        )

        self.assertEqual(action, "inserted")
        self.assertIn("force_shm = true", updated)
        self.assertLess(
            updated.index("custom_picker_binary"),
            updated.index("force_shm"),
        )

    def test_reports_already_configured(self):
        original = "screencopy {\n    force_shm = true\n}\n"

        updated, action = doctor.insert_into_screencopy_block(
            original, "force_shm", "true"
        )

        self.assertEqual(action, "already")
        self.assertEqual(updated, original)

    def test_reports_missing_closing_brace(self):
        original = "screencopy {\n    custom_picker_binary = hyprland-share-picker\n"

        updated, action = doctor.insert_into_screencopy_block(
            original, "force_shm", "true"
        )

        self.assertEqual(action, "error")
        self.assertEqual(updated, original)


class VersionTests(unittest.TestCase):
    def test_parses_versions(self):
        self.assertEqual(doctor.version_tuple("1.4.1-1~bpo13+1"), (1, 4, 1))
        self.assertEqual(doctor.version_tuple("1.5.0"), (1, 5, 0))
        self.assertIsNone(doctor.version_tuple("master"))


if __name__ == "__main__":
    unittest.main()
