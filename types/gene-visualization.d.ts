/// <reference types="styled-jsx" />
declare module "gene-visualization" {
  export type ValueOf<T> = T[keyof T];

  export type InheritChartProps<T extends React.JSXElementConstructor<any>> =
    Omit<React.ComponentProps<T>, "data">;

  export type SwapKV<T extends Record<string, string>> = {
    [K in keyof T as T[K]]: K;
  };

  export type Coordinate = {
    x: number;
    y: number;
  };

  export type Dates = string[] | Date[];
}

type Entries<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

declare interface ObjectConstructor {
  entries<T extends object>(o: T): Entries<T>;
}

declare module "*.css";
