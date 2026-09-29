import "server-only";

// Next.js server code imports this guarded facade. Standalone workers import
// deepseek-runtime directly because the server-only package intentionally
// throws outside the Next.js module graph.
export * from "@/lib/ai/deepseek-runtime";
