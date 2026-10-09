/**
 * Read an OpenAI-compatible streamed completion, and refuse a truncated one.
 *
 * A stream that stops part-way can leave a tool call with half its arguments,
 * and an agent that acts on that would pay for the wrong thing. So a turn
 * counts only if the stream ended with [DONE] after a `stop` or `tool_calls`
 * finish; anything else throws and nothing is executed.
 */
export async function consumeLLMStream(body, onDelta) {
  if (!body) throw new Error("The model returned no response stream");
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  let finished = false;

  function line(raw) {
    const text = raw.trim();
    if (!text.startsWith("data:")) return;
    const data = text.slice(5).trim();
    if (!data) return;
    if (data === "[DONE]") { done = true; return; }
    if (done) throw new Error("The model sent data after the stream ended");
    const frame = JSON.parse(data);
    if (frame.error) throw new Error(`The model stream failed: ${frame.error.message ?? "provider error"}`);
    if (!Array.isArray(frame.choices)) throw new Error("The model stream has no choices");
    const choice = frame.choices[0];
    if (!choice) return;
    if (choice.finish_reason) {
      if (!["stop", "tool_calls"].includes(choice.finish_reason)) {
        throw new Error(`The model did not finish its decision: ${choice.finish_reason}`);
      }
      finished = true;
    }
    onDelta(choice.delta ?? {});
  }

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let at;
    while ((at = buffer.indexOf("\n")) >= 0) {
      line(buffer.slice(0, at));
      buffer = buffer.slice(at + 1);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) line(buffer);
  if (!done || !finished) throw new Error("The model's answer was cut off; nothing will be executed");
}
