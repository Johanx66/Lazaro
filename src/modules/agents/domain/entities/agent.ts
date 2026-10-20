export type AgentStatus = "AVAILABLE" | "BUSY" | "OFFLINE";

export interface Agent {
  id: string;
  name: string;
  email: string;
  status: AgentStatus;
  createdAt: Date;
}
