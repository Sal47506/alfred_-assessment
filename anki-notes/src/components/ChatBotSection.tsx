import { useState, useEffect } from "react";

type Message = {
  sender: "user" | "llm";
  text: string;
};

const ChatBotSection = () => {
  const [inputValue, setInputValue] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentLLMMessage, setCurrentLLMMessage] = useState<string>("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    setMessages((prev) => [
      ...prev,
      { sender: "user", text: inputValue },
    ]);

    // 🔥 This is where you would call MCP / LLM
    // Example mock response:
    setCurrentLLMMessage("Thinking...");

    setInputValue("");
  };

  useEffect(() => {
    if (currentLLMMessage) {
      setMessages((prev) => [
        ...prev,
        { sender: "llm", text: currentLLMMessage },
      ]);
    }
  }, [currentLLMMessage]);

  return (
    <div className="flex flex-col gap-4 max-w-xl mx-auto p-4">
      
      {/* Chat Messages */}
      <div className="flex flex-col gap-3 h-96 overflow-y-auto border p-4 rounded-xl">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`p-3 rounded-xl max-w-xs ${
              msg.sender === "user"
                ? "bg-blue-500 text-white self-end"
                : "bg-gray-200 text-black self-start"
            }`}
          >
            {msg.text}
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="flex-1 border p-2 rounded-lg"
          placeholder="Type your message..."
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded-lg"
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatBotSection;
