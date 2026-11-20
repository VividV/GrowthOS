"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@platform/ui";
import { ActionForm } from "@/components/action-form";
import { TextAreaField, TextField } from "@/components/form-fields";
import { supportRequestAction } from "@/server/settings-actions";

export default function Support() {
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Contact support</CardTitle><CardDescription>Tell us what&apos;s wrong or what you need. We reply by email.</CardDescription></CardHeader>
      <CardContent>
        <ActionForm action={supportRequestAction} resetOnSuccess className="space-y-4">
          {({ pending }) => (<>
            <TextField name="subject" label="Subject" required />
            <TextAreaField name="message" label="Message" required className="[&_textarea]:min-h-[140px]" />
            <Button type="submit" loading={pending}>Send</Button>
          </>)}
        </ActionForm>
      </CardContent>
    </Card>
  );
}
