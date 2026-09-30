import "server-only";

// API routes retain the Next.js server-only guard. The Topic Worker imports
// service-runtime directly so its independent Node process can bootstrap.
export * from "@/lib/topics/service-runtime";
