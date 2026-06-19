export interface GeneratedPieceResponse {
  writeup: string;
  isMock: boolean;
  error?: string;
}

export interface RuleAudit {
  name: string;
  description: string;
  passed: boolean;
  statusText: string;
  type: 'success' | 'warn' | 'info';
}

export interface PresetTopic {
  id: string;
  title: string;
  prompt: string;
  category: 'Fintech & Stocks' | 'AI & Product' | 'Cricket & Fun' | 'Delhi NCR Life';
  vibeText?: string;
}
