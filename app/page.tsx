import {Suspense} from "react";
import Loading from "./loading";
import Dashboard from "@/components/life/Dashboard";
export const dynamic = "force-dynamic";
export default function Home() { return <Suspense fallback={<Loading/>}><Dashboard /></Suspense>; }
