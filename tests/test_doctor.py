import importlib.util
import json
import sys
import tempfile
import unittest
import unittest.mock
import zipfile
from importlib.machinery import SourceFileLoader
from pathlib import Path
from types import SimpleNamespace

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

        self.assertTrue(action.startswith("error"))
        self.assertEqual(updated, original)


class VersionTests(unittest.TestCase):
    def test_parses_versions(self):
        self.assertEqual(doctor.version_tuple("1.4.1-1~bpo13+1"), (1, 4, 1))
        self.assertEqual(doctor.version_tuple("1.5.0"), (1, 5, 0))
        self.assertIsNone(doctor.version_tuple("master"))

    def test_parses_epoch_and_two_part_versions(self):
        self.assertEqual(doctor.version_tuple("1:1.4.1-1"), (1, 4, 1))
        self.assertEqual(doctor.version_tuple("1.5"), (1, 5, 0))
        self.assertEqual(doctor.version_tuple("2:0.9"), (0, 9, 0))
        self.assertEqual(
            doctor.version_tuple("Mozilla Firefox 153.6.0esr"),
            (153, 6, 0),
        )


class ScreencopyEdgeTests(unittest.TestCase):
    def test_replaces_false_with_true(self):
        original = "screencopy {\n    force_shm = false\n}\n"

        updated, action = doctor.insert_into_screencopy_block(
            original, "force_shm", "true"
        )

        self.assertEqual(action, "replaced")
        self.assertIn("force_shm = true", updated)
        self.assertNotIn("force_shm = false", updated)

    def test_replaces_false_with_comment(self):
        original = "screencopy {\n    force_shm = false # keep\n}\n"

        updated, action = doctor.insert_into_screencopy_block(
            original, "force_shm", "true"
        )

        self.assertEqual(action, "replaced")
        self.assertIn("force_shm = true", updated)
        self.assertNotIn("force_shm = false", updated)

    def test_ignores_key_in_another_section(self):
        original = (
            "screenshot {\n    force_shm = true\n}\n"
            "screencopy {\n    custom_picker_binary = hyprland-share-picker\n}\n"
        )

        updated, action = doctor.insert_into_screencopy_block(
            original, "force_shm", "true"
        )

        self.assertEqual(action, "inserted")
        screencopy = updated.split("screencopy", 1)[1]
        self.assertIn("force_shm = true", screencopy)

    def test_refuses_duplicate_blocks(self):
        original = (
            "screencopy {\n    force_shm = false\n}\n"
            "screencopy {\n    force_shm = false\n}\n"
        )

        updated, action = doctor.insert_into_screencopy_block(
            original, "force_shm", "true"
        )

        self.assertEqual(action, "error:multiple-blocks")
        self.assertEqual(updated, original)

    def test_handles_inline_block(self):
        original = "screencopy { custom_picker_binary = hyprland-share-picker }\n"

        updated, action = doctor.insert_into_screencopy_block(
            original, "force_shm", "true"
        )

        self.assertEqual(action, "inserted-inline")
        self.assertIn("force_shm = true", updated)

    def test_preserves_crlf(self):
        original = "screencopy {\r\n    custom_picker_binary = hyprland-share-picker\r\n}\r\n"

        updated, action = doctor.insert_into_screencopy_block(
            original, "force_shm", "true"
        )

        self.assertEqual(action, "inserted")
        self.assertIn("\r\n", updated)
        self.assertNotIn("\n", updated.replace("\r\n", ""))

    def test_preserves_missing_trailing_newline(self):
        original = "screencopy {\n    custom_picker_binary = hyprland-share-picker\n}"

        updated, action = doctor.insert_into_screencopy_block(
            original, "force_shm", "true"
        )

        self.assertEqual(action, "inserted")
        self.assertFalse(updated.endswith("\n"))

    def test_does_not_add_double_trailing_newline(self):
        original = "screencopy {\n    custom_picker_binary = hyprland-share-picker\n}\n"

        updated, action = doctor.insert_into_screencopy_block(
            original, "force_shm", "true"
        )

        self.assertEqual(action, "inserted")
        self.assertTrue(updated.endswith("}\n"))
        self.assertFalse(updated.endswith("}\n\n"))


class ScreencopyValuesTests(unittest.TestCase):
    def test_reads_only_screencopy_section(self):
        text = (
            "screenshot {\n    force_shm = true\n}\n"
            "screencopy {\n    force_shm = false\n"
            "    custom_picker_binary = hyprland-share-picker\n}\n"
        )

        values = doctor.screencopy_values(text)

        self.assertEqual(values["force_shm"], "false")
        self.assertEqual(
            values["custom_picker_binary"],
            "hyprland-share-picker",
        )

    def test_reads_inline_screencopy_section(self):
        values = doctor.screencopy_values(
            "screencopy { force_shm = true; custom_picker_binary = hyprland-share-picker }\n"
        )

        self.assertEqual(values["force_shm"], "true")
        self.assertEqual(
            values["custom_picker_binary"],
            "hyprland-share-picker",
        )

    def test_strips_inline_comments_and_ignores_nested_blocks(self):
        values = doctor.screencopy_values(
            "screencopy {\n"
            "    force_shm = true # keep\n"
            "    nested {\n"
            "        force_shm = false\n"
            "    }\n"
            "}\n"
        )

        self.assertEqual(values["force_shm"], "true")


class PrefCheckTests(unittest.TestCase):
    def test_warns_on_false_capture_prefs(self):
        with tempfile.TemporaryDirectory() as tmp:
            profile = Path(tmp) / "profile"
            profile.mkdir()
            (profile / "prefs.js").write_text(
                'user_pref("media.webrtc.capture.allow-pipewire", false);\n'
                'user_pref("media.navigator.video.resize_mode.enabled", false);\n',
                encoding="utf-8",
            )

            check = doctor.check_prefs([profile])

            self.assertEqual(check.status, "WARN")
            self.assertIn("pipewire=false", check.detail)
            self.assertIn("resizeMode=false", check.detail)

    def test_passes_default_prefs(self):
        with tempfile.TemporaryDirectory() as tmp:
            profile = Path(tmp) / "profile"
            profile.mkdir()
            (profile / "prefs.js").write_text("", encoding="utf-8")

            check = doctor.check_prefs([profile])

            self.assertEqual(check.status, "PASS")


class OpenH264Tests(unittest.TestCase):
    def test_warns_when_plugin_disabled(self):
        with tempfile.TemporaryDirectory() as tmp:
            profile = Path(tmp) / "profile"
            plugin = profile / "gmp-gmpopenh264" / "2.6.0"
            plugin.mkdir(parents=True)
            (plugin / "libgmpopenh264.so").write_bytes(b"")
            (profile / "prefs.js").write_text(
                'user_pref("media.gmp-gmpopenh264.enabled", false);\n',
                encoding="utf-8",
            )

            check = doctor.check_openh264([profile])

            self.assertEqual(check.status, "WARN")
            self.assertIn("deshabilitado", check.detail)

    def test_fails_without_plugin(self):
        with tempfile.TemporaryDirectory() as tmp:
            profile = Path(tmp) / "profile"
            profile.mkdir()
            (profile / "prefs.js").write_text("", encoding="utf-8")

            check = doctor.check_openh264([profile])

            self.assertEqual(check.status, "FAIL")


class WebCompatTests(unittest.TestCase):
    def _make_omni(self, directory: Path, matches: list[str]) -> Path:
        omni = directory / "omni.ja"
        payload = {
            "bugs": {
                "2000906": {
                    "matches": matches,
                }
            }
        }
        with zipfile.ZipFile(omni, "w") as archive:
            archive.writestr(doctor.WEBCOMPAT_FILE, json.dumps(payload))
        return omni

    def test_passes_when_all_domains_are_present(self):
        with tempfile.TemporaryDirectory() as tmp:
            omni = self._make_omni(Path(tmp), doctor.TEAMS_MATCHES)
            with unittest.mock.patch.object(doctor, "find_omni_ja", return_value=omni):
                check = doctor.check_webcompat([])

            self.assertEqual(check.status, "PASS")

    def test_warns_when_domain_is_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            omni = self._make_omni(Path(tmp), ["*://teams.microsoft.com/*"])
            with unittest.mock.patch.object(doctor, "find_omni_ja", return_value=omni):
                check = doctor.check_webcompat([])

            self.assertEqual(check.status, "WARN")
            self.assertIn("teams.cloud.microsoft", check.detail)


class LogCheckTests(unittest.TestCase):
    def _check(self, output: str):
        result = SimpleNamespace(returncode=0, stdout=output, stderr="")
        with unittest.mock.patch.object(
            doctor.shutil, "which", return_value="/usr/bin/journalctl"
        ), unittest.mock.patch.object(doctor, "run", return_value=result):
            return doctor.check_logs()

    def test_selection_minus_one_is_not_a_hard_failure(self):
        check = self._check("xdg-desktop-portal-hyprland: selection -1\n")

        self.assertEqual(check.status, "INFO")

    def test_out_of_buffers_is_a_hard_failure(self):
        check = self._check("xdg-desktop-portal-hyprland: Out of buffers\n")

        self.assertEqual(check.status, "WARN")

    def test_no_entries_is_info(self):
        check = self._check("-- No entries --\n")

        self.assertEqual(check.status, "INFO")


class ProbableCauseTests(unittest.TestCase):
    def test_session_failure_has_priority(self):
        checks = [
            doctor.Check("session", "session", "FAIL"),
            doctor.Check("firefox", "firefox", "PASS"),
            doctor.Check("openh264", "openh264", "FAIL"),
        ]

        self.assertIn("Sesión", doctor.probable_cause(checks))

    def test_portal_failure(self):
        checks = [doctor.Check("portal", "portal", "FAIL")]

        self.assertIn("Portal", doctor.probable_cause(checks))

    def test_portal_failure_beats_session_warning(self):
        checks = [
            doctor.Check("session", "session", "WARN"),
            doctor.Check("portal", "portal", "FAIL"),
        ]

        self.assertIn("Portal", doctor.probable_cause(checks))

    def test_xdph_warning_is_labelled_suspicious(self):
        checks = [doctor.Check("xdph", "xdph", "WARN")]

        self.assertIn("sospechoso", doctor.probable_cause(checks))


class MainTests(unittest.TestCase):
    def test_json_and_fix_are_mutually_exclusive(self):
        self.assertEqual(
            doctor.main(["--json", "--fix", "xdph-force-shm"]),
            2,
        )


if __name__ == "__main__":
    unittest.main()
