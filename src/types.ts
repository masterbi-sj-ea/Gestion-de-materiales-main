export type UserRole = string;

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  area?: string;
}
