import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import * as fs from 'fs';
import * as path from 'path';
const consoleLog = (msg: string) => {
  fs.appendFileSync(path.join(__dirname, 'log.txt'), msg + '\n');
}

export const POST = async (req: NextRequest) => {
  consoleLog("Webhook received");
  const rawBody = await req.text();
  const signature = headers().get("Stripe-Signature") as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return new NextResponse(`Webhook error: ${err.message}`, { status: 400 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const customerId = session?.metadata?.customerId;
  const courseId = session?.metadata?.courseId;

  try {
    if (event.type === "checkout.session.completed") {
      if (!customerId || !courseId) {
        return new NextResponse("Missing metadata", { status: 400 });
      }
  
      await db.purchase.create({
        data: {
          customerId,
          courseId,
        },
      });
  
      // Return a success response after creating the purchase
      return new NextResponse("Purchase created successfully", { status: 200 });
    } else {
      return new NextResponse(`Unhandled event type: ${event.type}`, {
        status: 400,
      });
    }
  } catch (error) {
    consoleLog("Error processing checkout session:");
    // Return an error response if there's an exception
    return new NextResponse("Error processing request", { status: 500 });
  }

  return new NextResponse("Success", { status: 200 });
};
