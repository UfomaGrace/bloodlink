import YAML from "yaml";
import { describe, expect, it } from "vitest";
import contractText from "../../contract/openapi.yaml?raw";
import { api } from "./endpoints";

// Contract operationIds whose entry in `api` has a different name.
const RENAMED: Record<string, string> = { getHealth: "health" };

const METHODS = ["get", "put", "post", "delete", "patch", "head", "options", "trace"];

type Contract = { paths: Record<string, Record<string, { operationId?: string }>> };

function contractOperationIds(): string[] {
  const contract = YAML.parse(contractText) as Contract;
  const ids: string[] = [];
  for (const item of Object.values(contract.paths)) {
    for (const method of METHODS) {
      const id = item[method]?.operationId;
      if (id) ids.push(RENAMED[id] ?? id);
    }
  }
  return ids.sort();
}

describe("api endpoints", () => {
  const fromContract = contractOperationIds();
  const inApi = Object.keys(api).sort();

  it("reads operations from the contract", () => {
    expect(fromContract.length).toBeGreaterThan(0);
  });

  it("has an entry for every operation in the contract", () => {
    expect(fromContract.filter((id) => !inApi.includes(id))).toEqual([]);
  });

  it("has no entry that is not an operation in the contract", () => {
    expect(inApi.filter((name) => !fromContract.includes(name))).toEqual([]);
  });
});
