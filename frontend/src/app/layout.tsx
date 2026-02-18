import AuthListener from "@/components/auth/AuthListener";
import QueryProvider from "@/providers/QueryProvider";
import "./globals.css";
import { Metadata } from "next";
import { Toaster } from "sonner";

export const metadata:Metadata={
  title:"Blip",
  description:"Chat app"
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <QueryProvider>
          <AuthListener />
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
