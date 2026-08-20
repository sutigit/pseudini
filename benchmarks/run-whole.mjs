process.env.AIME_BENCH_CASES = "whole-file";
process.env.AIME_BENCH_OUTPUT ??= "whole-file.json";

await import("./run.mjs");
