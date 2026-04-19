import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AccessPortal from "../components/AccessPortal";

test("submits credentials to onEnter", async () => {
  const onEnter = vi.fn().mockResolvedValue(undefined);
  render(<AccessPortal onEnter={onEnter} />);

  fireEvent.change(screen.getByLabelText(/Work email/i), { target: { value: "ops@example.com" } });
  fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "secret" } });
  fireEvent.click(screen.getByRole("button", { name: /Enter Workspace/i }));

  await waitFor(() => expect(onEnter).toHaveBeenCalledTimes(1));
  expect(onEnter.mock.calls[0][0]).toMatchObject({
    email: "ops@example.com",
    password: "secret",
  });
});
