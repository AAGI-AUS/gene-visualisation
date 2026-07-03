export const SVGText = ({ t, children, ...props }: SVGTextProps) => (
  <text {...props}>{t !== undefined ? t : children}</text>
);

interface SVGTextProps extends React.SVGProps<SVGTextElement> {
  t?: string;
}
