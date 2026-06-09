import { describe, it, expect } from "vitest";
import {
  isValidPinFormat,
  hashPin,
  comparePin,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
} from "@/lib/pin";
import {
  isValidPasswordFormat,
  hashPassword,
  comparePassword,
  isValidUsername,
} from "@/lib/password";

describe("PIN — formato", () => {
  it("acepta exactamente 6 dígitos", () => {
    expect(isValidPinFormat("123456")).toBe(true);
  });
  it("rechaza longitudes distintas o con letras", () => {
    expect(isValidPinFormat("12345")).toBe(false);
    expect(isValidPinFormat("1234567")).toBe(false);
    expect(isValidPinFormat("12a456")).toBe(false);
    expect(isValidPinFormat("")).toBe(false);
  });
});

describe("PIN — hash / compare (bcrypt)", () => {
  it("hash + compare hacen roundtrip y rechazan el PIN equivocado", async () => {
    const hash = await hashPin("123456");
    expect(hash).not.toBe("123456");
    expect(await comparePin("123456", hash)).toBe(true);
    expect(await comparePin("654321", hash)).toBe(false);
  });
  it("hashPin rechaza un formato inválido", async () => {
    await expect(hashPin("12")).rejects.toThrow();
  });
  it("comparePin con formato inválido devuelve false sin tirar", async () => {
    expect(await comparePin("12", "$2a$12$invalidhashvalue")).toBe(false);
  });
  it("constantes de lockout", () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(5);
    expect(LOCKOUT_DURATION_MS).toBe(5 * 60 * 1000);
  });
});

describe("Password — formato", () => {
  it("requiere entre 8 y 200 caracteres", () => {
    expect(isValidPasswordFormat("12345678")).toBe(true);
    expect(isValidPasswordFormat("corto")).toBe(false);
    expect(isValidPasswordFormat("x".repeat(201))).toBe(false);
  });
});

describe("Password — hash / compare (bcrypt)", () => {
  it("roundtrip y rechazo del password equivocado", async () => {
    const hash = await hashPassword("supersecreto");
    expect(await comparePassword("supersecreto", hash)).toBe(true);
    expect(await comparePassword("otracosa", hash)).toBe(false);
  });
  it("comparePassword con string vacío devuelve false", async () => {
    expect(await comparePassword("", "$2a$12$whatever")).toBe(false);
  });
});

describe("Username", () => {
  it("acepta alfanuméricos, punto, guion y guion bajo (3-40)", () => {
    expect(isValidUsername("luciano")).toBe(true);
    expect(isValidUsername("ok.user-1_x")).toBe(true);
  });
  it("rechaza muy cortos, con espacios o caracteres raros", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("con espacio")).toBe(false);
    expect(isValidUsername("raro@!")).toBe(false);
  });
});
