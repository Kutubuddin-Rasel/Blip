import AuthListener from "@/components/auth/AuthListener";
import QueryProvider from "@/providers/QueryProvider";
import "./globals.css";
import { Metadata } from "next";

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
    <html lang="en">
      <body>
        <QueryProvider>
          <AuthListener />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
