import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useToast } from "@chakra-ui/react";

import { langStore, translate } from "@carefree0910/business";

import type { IPythonHttpPluginWithSubmit } from "@/schema/_python";
import { toast } from "@/utils/toast";
import { Toast_Words } from "@/lang/toast";
import { useHttpPython } from "@/hooks/usePython";
import CFButton from "@/components/CFButton";
import CFDivider from "@/components/CFDivider";
import Render from "../components/Render";
import { floatingControlEvent } from "../components/Floating";

function PythonHttpPluginWithSubmit<R>({
  id,
  pluginInfo: {
    node,
    nodes,
    endpoint,
    identifier,
    updateInterval,
    closeOnSubmit = true,
    toastOnSubmit = true,
    toastMessageOnSubmit,
  },
  buttonText,
  onUseHttpPythonError,
  onUseHttpPythonSuccess,
  beforeRequest,
  getExtraRequestData,
  children,
  ...props
}: IPythonHttpPluginWithSubmit<R>) {
  const t = useToast();
  const lang = langStore.tgt;
  const [send, setSend] = useState(false);

  useHttpPython<R>({
    t,
    lang,
    node,
    nodes,
    endpoint,
    identifier,
    isInvisible: props.renderInfo.isInvisible ?? false,
    updateInterval,
    forceNotSend: !send,
    onUseHttpPythonError,
    onUseHttpPythonSuccess,
    beforeRequest: async () => {
      setSend(false);
      beforeRequest && (await beforeRequest());
    },
    getExtraRequestData,
  });

  function onClick() {
    setSend(true);
    if (closeOnSubmit) {
      floatingControlEvent.emit({ id, expand: false });
    }
    if (toastOnSubmit) {
      toastMessageOnSubmit ??= translate(Toast_Words["submit-task-success-message"], lang);
      toast(t, "info", toastMessageOnSubmit);
    }
  }

  return (
    <Render id={id} {...props}>
      {children}
      <CFDivider />
      <CFButton onClick={onClick}>{buttonText}</CFButton>
    </Render>
  );
}

export default observer(PythonHttpPluginWithSubmit);
