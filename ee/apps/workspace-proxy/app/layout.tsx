export const metadata = {
  title: 'OpenWork Workspace',
  description: 'Your OpenWork cloud workspace',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
