import { domMax } from "framer-motion";

/**
 * The animation engine, in its own chunk: loaded after the page is on screen
 * rather than with it. domMax and not the smaller domAnimation because the
 * shell and the toasts use `layout`.
 */
export default domMax;
