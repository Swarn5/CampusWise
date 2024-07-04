import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export const POST = async (
  req: NextRequest,
  { params }: { params: { courseId: string } }
) => {
  try {
    console.log("Attempting to retrieve current user");
    const user = await currentUser();

    if (!user || !user.id || !user.emailAddresses?.[0]?.emailAddress) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    console.log("Attempting to find course");
    const course = await db.course.findUnique({
      where: { id: params.courseId, isPublished: true },
    });

    if (!course) {
      return new NextResponse("Course Not Found", { status: 404 });
    }

    console.log("Checking if course was already purchased");
    const purchase = await db.purchase.findUnique({
      where: {
        customerId_courseId: { customerId: user.id, courseId: course.id },
      },
    });

    if (purchase) {
      return new NextResponse("Course Already Purchased", { status: 400 });
    }

    console.log("Preparing line items for Stripe");
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        quantity: 1,
        price_data: {
          currency: "cad",
          product_data: {
            name: course.title,
          },
          unit_amount: Math.round(course.price! * 100),
        },
      }
    ]

    let stripeCustomer;
    try {
      stripeCustomer = await db.stripeCustomer.findUnique({
        where: { customerId: user.id },
        select: { stripeCustomerId: true },
      });

      if (!stripeCustomer) {
        const customer = await stripe.customers.create({
          email: user.emailAddresses[0].emailAddress,
        });

        stripeCustomer = await db.stripeCustomer.create({
          data: {
            customerId: user.id,
            stripeCustomerId: customer.id,
          },
        });
        //write a toast with the stripe customer id
        console.log("Stripe customer created: ", stripeCustomer.stripeCustomerId);
        
      }
      console.log("Stripe customer already exists: ", stripeCustomer.stripeCustomerId);
    } catch (err) {
      console.error("Error creating/fetching Stripe customer:", err);
      return new NextResponse("Error processing payment details", { status: 500 });
    }

    // Create Stripe checkout session

    // -------------------------ERROR--------------------------------------------

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        customer: stripeCustomer.stripeCustomerId,
        payment_method_types: ["card"],
        line_items,
        mode: "payment",
        success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/courses/${course.id}/overview?success=true`,
        cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/courses/${course.id}/overview?canceled=true`,
        metadata: {
          courseId: course.id,
          customerId: user.id,
        }
      });
    } catch (err) {
      console.error("Error creating Stripe checkout session:", err);
      return new NextResponse(`id:${stripeCustomer.stripeCustomerId}`, { status: 500 });
    }

    // -------------------------ERROR--------------------------------------------

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.log("[courseId_checkout_POST]", err);
    console.log(err);
    console.log(err);
    console.log(err);
    console.log("Swarn Shekhar");
    
    
    return new NextResponse("Internal Server Error my boyy", { status: 500 });
  }
};
