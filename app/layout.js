import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "UGC Creator Workflow",
  description: "Internal creator outreach workflow dashboard"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <nav className="app-nav">
          <Link href="/creators">Creators</Link>
          <Link href="/stages">Stages</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
