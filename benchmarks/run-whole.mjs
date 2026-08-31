process.env.PSEUDINI_BENCH_CASES = "whole-file";
process.env.PSEUDINI_BENCH_OUTPUT ??= "whole-file.json";

await import("./run.mjs");
