import type { IconBaseProps } from "react-icons";
import {
  MdAdd,
  MdCalendarMonth,
  MdCheck,
  MdClose,
  MdDownload,
  MdEdit,
  MdFileOpen,
  MdInfoOutline,
  MdRemove,
  MdRemoveCircle,
  MdReplayCircleFilled,
  MdSave,
  MdVisibility,
  MdVisibilityOff,
} from "react-icons/md";

const icon = {
  plus: MdAdd,
  minus: MdRemove,
  minusCircle: MdRemoveCircle,
  x: MdClose,
  check: MdCheck,
  edit: MdEdit,
  eye: MdVisibility,
  eyeOff: MdVisibilityOff,
  calendar: MdCalendarMonth,
  save: MdSave,
  download: MdDownload,
  info: MdInfoOutline,
  loading: MdReplayCircleFilled,
  import: MdFileOpen,
};

export type IconName = keyof typeof icon;

export const Icon = ({ iconName, size = "17px", ...props }: IconProps) => {
  const Icon = icon[iconName];
  return <Icon size={size} {...props} />;
};

type IconProps = IconBaseProps & {
  iconName: IconName;
};
