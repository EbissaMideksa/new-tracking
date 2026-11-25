"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton({
  fullWidth = false,
}: { fullWidth?: boolean }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    // fullWidth drops the fixed px-14 so the button fills a narrow column
    // (the sidebar is resizable down to 200px, and the mobile drawer is 184px —
    // at px-14 the label overflowed and got clipped by the sidebar's
    // overflow:hidden).
    <button
      onClick={logout}
      className={`${fullWidth ? "w-full px-3" : "px-14"} py-2 bg-red-500 text-white rounded`}
    >
      Logout
    </button>
  );
}

