import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import storesRouter from "./stores";
import chemicalsRouter from "./chemicals";
import inventoryRouter from "./inventory";
import reportsRouter from "./reports";
import agentConfigRouter from "./agentConfig";
import voiceRouter from "./voice";
import employeesRouter from "./employees";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storesRouter);
router.use(chemicalsRouter);
router.use(inventoryRouter);
router.use(reportsRouter);
router.use(agentConfigRouter);
router.use(voiceRouter);
router.use(employeesRouter);

export default router;
