import { InMemoryRepo } from "./in-memory-repo.js";
import { describeRepoContract } from "./repo-contract.js";

describeRepoContract("InMemoryRepo", () => ({ repo: new InMemoryRepo() }));
