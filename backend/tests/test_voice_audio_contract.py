"""Audio response contract without external STT, authentication or database calls."""
from copy import deepcopy
from io import BytesIO
import unittest
from unittest.mock import patch

from fastapi import UploadFile

from backend.voice.jangboso_voice.api import Merchant, build_router
from backend.voice.jangboso_voice.engine import VoiceService
from backend.voice.jangboso_voice.schema import Command


class AudioContractTest(unittest.TestCase):
    def setUp(self):
        self.result = {
            "command_id": "test-command",
            "intent": "PRODUCT_CREATE",
            "status": "NEEDS_CONFIRMATION",
            "parsed": {"intent": "PRODUCT_CREATE", "product_name": "사과"},
            "missing_fields": [],
            "expires_at": "2099-01-01T00:00:00+00:00",
            "message": "변경 내용을 확인해 주세요.",
            "candidates": [],
            "preview": {"before": None, "after": {"price": 5000}},
        }
        test = self

        class Service:
            def analyze(self, *_):
                return deepcopy(test.result)

        class STT:
            def transcribe(self, *_):
                return "테스트 음성"

        self.router = build_router(
            lambda actor: Service(), lambda: Merchant("user", "store"), STT(),
        )

    def audio(self, path="/voice/product-registration"):
        # Existing API debug prints are suppressed; never log uploaded content.
        endpoint = next(route.endpoint for route in self.router.routes
                        if route.path == path)
        with patch("builtins.print"):
            return endpoint(
                audio_file=UploadFile(filename="test.wav", file=BytesIO(b"test-audio")),
                actor=Merchant("user", "store"),
            )

    def test_ready_preserves_preview_and_nullable_question(self):
        for path in ("/voice/product-registration", "/voice/analyze-audio"):
            with self.subTest(path=path):
                data = self.audio(path)
                self.assertEqual(data["status"], "READY")
                self.assertTrue(data["needs_confirmation"])
                self.assertIsNone(data["question"])
                self.assertEqual(data["preview"], self.result["preview"])
                self.assertEqual(data["candidates"], [])
                self.assertEqual(data["execution_endpoint"],
                                 "/voice/product-registration/confirm")

    def test_needs_input_preserves_engine_prompt(self):
        self.result.update(status="NEEDS_INPUT", missing_fields=["price"],
                           message="가격을 얼마로 할까요?", preview=None)
        data = self.audio()
        self.assertEqual(data["question"], self.result["message"])
        self.assertEqual(data["message"], self.result["message"])
        self.assertFalse(data["needs_confirmation"])
        self.assertIsNone(data["execution_endpoint"])

    def test_explicit_question_and_empty_prompt_fallback(self):
        self.result.update(status="NEEDS_INPUT", missing_fields=["price"],
                           question="구체적인 추가 질문", message="일반 안내")
        self.assertEqual(self.audio()["question"], "구체적인 추가 질문")
        self.result.update(question=" ", message=" ")
        self.assertTrue(self.audio()["question"].strip())

    def test_engine_clarification_without_missing_fields(self):
        service = VoiceService.__new__(VoiceService)
        for intent in ("UNKNOWN", "MULTIPLE", "PRODUCT_DELETE"):
            with self.subTest(intent=intent):
                command = {
                    "command_id": "clarification-test", "store_id": "store",
                    "expires_at": "2099-01-01T00:00:00+00:00",
                    "parsed": Command(intent=intent, product_name="사과").model_dump(),
                }
                service._plan({"products": {}}, command)
                self.result = command
                data = self.audio()
                self.assertEqual(data["status"], "NEEDS_INPUT")
                self.assertEqual(data["missing_fields"], [])
                self.assertEqual(data["question"], command["message"])
                self.assertTrue(data["question"].strip())
                self.assertFalse(data["needs_confirmation"])
                self.assertIsNone(data["execution_endpoint"])

    def test_selection_preserves_candidates(self):
        self.result.update(status="NEEDS_SELECTION", preview=None,
                           candidates=[{"listing_id": "one", "product_name": "사과"}])
        data = self.audio()
        self.assertEqual(data["status"], "NEEDS_SELECTION")
        self.assertEqual(data["candidates"], self.result["candidates"])
        self.assertIsNone(data["question"])
        self.assertIsNone(data["execution_endpoint"])


if __name__ == "__main__":
    unittest.main()
