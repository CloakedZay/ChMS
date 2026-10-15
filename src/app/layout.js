import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/app/context/AuthContext";
import { ThemeProvider } from "@/app/context/ThemeContext";
import SessionWatcher from "@/app/lib/SessionWatcher";
import DialogHost from "@/app/components/DialogHost";
import IdleLogout from "@/app/lib/IdleLogout";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata = {
  title: "FaithSync",
  description: "Church Management System",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"
      suppressHydrationWarning={true}
      >
        <SessionWatcher />
        <AuthProvider>
          {/* Signs out after 30 minutes with no activity */}
          <IdleLogout />
          <ThemeProvider>
            {children}
            {/* The app's own confirm / alert pop-ups (lib/dialog.js) */}
            <DialogHost />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}