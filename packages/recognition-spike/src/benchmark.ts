import { runRecognitionBenchmark } from "./index.js";

console.log("=== T-030 Biometric Recognition Spike Benchmark ===");
const metrics = runRecognitionBenchmark();
console.log(`Vector Dimension:               ${metrics.vectorDimension} floats`);
console.log(`Cold Start Latency:             ${metrics.coldStartLatencyMs.toFixed(3)} ms`);
console.log(`Warm 1:1 Vector Comparison:     ${metrics.warmComparisonLatencyUs.toFixed(3)} microseconds`);
console.log(`1:100 Cohort Search Latency:    ${metrics.cohortSearchLatencyMs.toFixed(3)} ms`);
console.log(`Memory Footprint:               ${metrics.memoryUsedMb.toFixed(3)} MB`);
console.log(`Match Threshold:                ${metrics.thresholds.matchThreshold}`);
console.log(`Ambiguity Margin:               ${metrics.thresholds.ambiguityMargin}`);
console.log("====================================================");
