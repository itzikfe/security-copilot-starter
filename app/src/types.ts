export type Issue = {
  id: string;
  name: string;
  reference?: string;
  description?: string;
  recommendations?: string[];
  severityScore?: number; // 👈 new
};
