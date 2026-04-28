// Platform-specific implementation:
// - assistant-streaming-markdown.web.tsx uses Streamdown for web streaming markdown.
// - assistant-streaming-markdown.native.tsx keeps native on the existing markdown renderer.
export * from "./assistant-streaming-markdown.native";
