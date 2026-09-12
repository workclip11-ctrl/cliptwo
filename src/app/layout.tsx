import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { AuthProvider } from "@/lib/auth";
import { ErrorToast } from "@/components/ErrorToast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://cliptwo.com"),
  title: "cliptwo — clip long videos into shorts",
  description:
    "A two-sided marketplace connecting creators with clippers who turn long videos into shorts.",
  icons: {
    icon: "/favicon.png",
  },
  openGraph: {
    title: "cliptwo — clip long videos into shorts",
    description:
      "A two-sided marketplace connecting creators with clippers who turn long videos into shorts.",
    siteName: "cliptwo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "cliptwo — clip long videos into shorts",
    description:
      "A two-sided marketplace connecting creators with clippers who turn long videos into shorts.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout(props: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AuthProvider>
          <StoreProvider>
            {props.children}
            <ErrorToast />
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
