/**
 * Shared shape for the subscribe form and its Server Action.
 *
 * Lives outside the action module because a `"use server"` file may only
 * export async functions — a plain object export fails the build.
 */
export interface SubscribeState {
  status: "idle" | "success" | "error";
  message: string;
}

export const initialSubscribeState: SubscribeState = { status: "idle", message: "" };
