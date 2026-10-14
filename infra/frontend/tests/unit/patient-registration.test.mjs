import test from "node:test";
import assert from "node:assert/strict";
import { BackendError } from "@vinshc/core";
import { registrationPayload } from "@vinshc/patients";

const validRegistration = (cccd) => ({
  familyName: "Nguyễn",
  givenName: "Bình",
  gender: "F",
  birthPrecision: "unknown",
  cccd,
});

test("new patient registration requires a 12-digit CCCD", () => {
  assert.throws(
    () => registrationPayload(validRegistration("")),
    (error) => error instanceof BackendError && /Cần nhập số CCCD/.test(error.message),
  );
  assert.throws(
    () => registrationPayload(validRegistration("123")),
    (error) => error instanceof BackendError && /12 chữ số/.test(error.message),
  );

  const payload = registrationPayload(validRegistration(" 001090000001 "));
  assert.deepEqual(payload.identifiers, [
    { type: "cccd", identifier: "001090000001" },
  ]);
});
