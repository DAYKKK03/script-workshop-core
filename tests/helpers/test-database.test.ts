import assert from "node:assert/strict";
import test from "node:test";
import {
  assertIsolatedTestDatabaseUrl,
  parsePostgresPhysicalTarget
} from "./test-database";

const primary = "postgresql://app:primary@db.example:5432/douyin_scripts?schema=public";

test("accepts only explicit PostgreSQL test database name boundaries", () => {
  for (const databaseName of ["test", "test_scripts", "douyin_scripts_test", "%64ouyin_scripts_test"]) {
    assert.doesNotThrow(() => assertIsolatedTestDatabaseUrl(
      `postgresql://app:test@db.example:5432/${databaseName}?schema=public`,
      primary
    ));
  }
  for (const databaseName of ["contest", "production", "production_test_backup", "attestdb"]) {
    assert.throws(() => assertIsolatedTestDatabaseUrl(
      `postgresql://app:test@db.example:5432/${databaseName}?schema=test`,
      primary
    ));
  }
});

test("rejects test markers outside the decoded database name", () => {
  for (const url of [
    "postgresql://test_user:secret@db.example:5432/production",
    "postgresql://app:test_password@db.example:5432/production",
    "postgresql://app:secret@test.example:5432/production",
    "postgresql://app:secret@db.example:5432/production?schema=test",
    "postgresql://app:secret@db.example:5432/con%74est"
  ]) {
    assert.throws(() => assertIsolatedTestDatabaseUrl(url, primary));
  }
});

test("normalizes the physical target and rejects the primary database", () => {
  const testUrl = "postgres://other:credentials@DB.EXAMPLE/douyin_scripts_test?schema=z&connection_limit=1";
  const sameTarget = "postgresql://app:primary@db.example:5432/douyin_scripts_test?connection_limit=9&schema=public";
  assert.deepEqual(parsePostgresPhysicalTarget(testUrl), {
    host: "db.example",
    port: "5432",
    database: "douyin_scripts_test"
  });
  assert.throws(() => assertIsolatedTestDatabaseUrl(testUrl, sameTarget));
});

test("treats localhost all IPv4 127/8 addresses and IPv6 loopback as one target", () => {
  const localhostPrimary = "postgresql://primary:secret@localhost:5432/app_test?schema=public";
  for (const candidate of [
    "postgresql://other:secret@localhost:5432/app_test?schema=other",
    "postgresql://other:secret@LOCALHOST.:5432/app_test",
    "postgresql://other:secret@127.0.0.1:5432/app_test",
    "postgresql://other:secret@127.42.8.9:5432/app_test",
    "postgresql://other:secret@127.255.255.254:5432/app_test",
    "postgresql://other:secret@[::1]:5432/app_test"
  ]) {
    assert.throws(() => assertIsolatedTestDatabaseUrl(candidate, localhostPrimary));
  }
  assert.doesNotThrow(() => assertIsolatedTestDatabaseUrl(
    "postgresql://other:secret@[::1]:5432/other_test",
    localhostPrimary
  ));
});

test("normalizes traditional IPv4 numbers mapped IPv6 and expanded IPv6 loopback", () => {
  const primary = "postgresql://primary:secret@localhost:5432/app_test";
  const equivalentLoopbacks = [
    "127.1",
    "127.0.1",
    "0177.0.0.1",
    "2130706433",
    "0x7f000001",
    "[::ffff:127.0.0.1]",
    "[::ffff:7f00:1]",
    "[::ffff:7fff:fffe]",
    "[0:0:0:0:0:ffff:7f00:1]",
    "[0:0:0:0:0:0:0:1]"
  ];
  for (const host of equivalentLoopbacks) {
    assert.throws(() => assertIsolatedTestDatabaseUrl(
      `postgresql://candidate:secret@${host}:5432/app_test`,
      primary
    ), host);
  }

  const nonLoopbacks = [
    "128.0.0.1",
    "2147483649",
    "0x80000001",
    "[::2]",
    "[::ffff:7eff:ffff]",
    "[::ffff:8000:1]"
  ];
  for (const host of nonLoopbacks) {
    assert.doesNotThrow(() => assertIsolatedTestDatabaseUrl(
      `postgresql://candidate:secret@${host}:5432/app_test`,
      primary
    ), host);
  }

  assert.doesNotThrow(() => assertIsolatedTestDatabaseUrl(
    "postgresql://candidate:secret@0x7f000001:5432/other_test",
    primary
  ));
});

test("rejects malformed numeric IP hosts without rejecting ordinary hostnames", () => {
  for (const host of ["999.0.0.1", "4294967296", "0x100000000", "127.0.0.1.2", "127.08.1.1"]) {
    assert.throws(() => assertIsolatedTestDatabaseUrl(
      `postgresql://candidate:secret@${host}:5432/app_test`,
      "postgresql://primary:secret@db.example:5432/main"
    ), host);
  }
  assert.doesNotThrow(() => assertIsolatedTestDatabaseUrl(
    "postgresql://candidate:secret@db.example:5432/app_test",
    "postgresql://primary:secret@primary.example:5432/main"
  ));
});

test("rejects unsupported protocols malformed paths and missing primary URL", () => {
  for (const url of [
    "mysql://app:test@db.example:3306/douyin_scripts_test",
    "https://db.example/douyin_scripts_test",
    "postgresql://db.example/",
    "postgresql://db.example/test%2Fother"
  ]) {
    assert.throws(() => assertIsolatedTestDatabaseUrl(url, primary));
  }
  assert.throws(() => assertIsolatedTestDatabaseUrl(
    "postgresql://db.example/douyin_scripts_test",
    undefined
  ));
});
