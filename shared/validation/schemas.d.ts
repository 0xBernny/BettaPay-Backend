import { z } from 'zod';
export declare const idSchema: z.ZodString;
export declare const isoDateString: z.ZodEffects<z.ZodString, string, string>;
export declare const userSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    displayName: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodEffects<z.ZodString, string, string>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    email: string;
    createdAt: string;
    displayName?: string | undefined;
    metadata?: Record<string, any> | undefined;
}, {
    id: string;
    email: string;
    createdAt: string;
    displayName?: string | undefined;
    metadata?: Record<string, any> | undefined;
}>;
export declare const merchantSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    ownerId: z.ZodString;
    createdAt: z.ZodEffects<z.ZodString, string, string>;
    deletedAt: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    settings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    name: string;
    ownerId: string;
    deletedAt?: string | undefined;
    settings?: Record<string, any> | undefined;
}, {
    id: string;
    createdAt: string;
    name: string;
    ownerId: string;
    deletedAt?: string | undefined;
    settings?: Record<string, any> | undefined;
}>;
export declare const walletSchema: z.ZodObject<{
    id: z.ZodString;
    ownerId: z.ZodString;
    address: z.ZodString;
    asset: z.ZodString;
    balance: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    ownerId: string;
    address: string;
    asset: string;
    balance: string;
}, {
    id: string;
    ownerId: string;
    address: string;
    asset: string;
    balance: string;
}>;
export declare const transactionSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["payment", "settlement", "anchor_transfer", "fx"]>;
    amount: z.ZodString;
    asset: z.ZodString;
    from: z.ZodNullable<z.ZodString>;
    to: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodEffects<z.ZodString, string, string>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    type: "payment" | "settlement" | "anchor_transfer" | "fx";
    asset: string;
    amount: string;
    from: string | null;
    to: string | null;
    metadata?: Record<string, any> | undefined;
}, {
    id: string;
    createdAt: string;
    type: "payment" | "settlement" | "anchor_transfer" | "fx";
    asset: string;
    amount: string;
    from: string | null;
    to: string | null;
    metadata?: Record<string, any> | undefined;
}>;
export declare const paymentSchema: z.ZodObject<{
    id: z.ZodString;
    merchantId: z.ZodString;
    payerId: z.ZodOptional<z.ZodString>;
    amount: z.ZodString;
    asset: z.ZodString;
    status: z.ZodEnum<["initiated", "completed", "failed", "cancelled"]>;
    createdAt: z.ZodEffects<z.ZodString, string, string>;
    reference: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    status: "initiated" | "completed" | "failed" | "cancelled";
    asset: string;
    amount: string;
    merchantId: string;
    metadata?: Record<string, any> | undefined;
    payerId?: string | undefined;
    reference?: string | undefined;
}, {
    id: string;
    createdAt: string;
    status: "initiated" | "completed" | "failed" | "cancelled";
    asset: string;
    amount: string;
    merchantId: string;
    metadata?: Record<string, any> | undefined;
    payerId?: string | undefined;
    reference?: string | undefined;
}>;
export declare const settlementSchema: z.ZodObject<{
    id: z.ZodString;
    merchantId: z.ZodString;
    totalAmount: z.ZodString;
    grossAmount: z.ZodString;
    feeAmount: z.ZodString;
    netAmount: z.ZodString;
    feeBps: z.ZodNumber;
    asset: z.ZodString;
    batchId: z.ZodOptional<z.ZodString>;
    initiatedAt: z.ZodEffects<z.ZodString, string, string>;
    completedAt: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    status: z.ZodEnum<["pending", "processing", "completed", "failed"]>;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: "completed" | "failed" | "pending" | "processing";
    asset: string;
    merchantId: string;
    totalAmount: string;
    grossAmount: string;
    feeAmount: string;
    netAmount: string;
    feeBps: number;
    initiatedAt: string;
    batchId?: string | undefined;
    completedAt?: string | undefined;
}, {
    id: string;
    status: "completed" | "failed" | "pending" | "processing";
    asset: string;
    merchantId: string;
    totalAmount: string;
    grossAmount: string;
    feeAmount: string;
    netAmount: string;
    feeBps: number;
    initiatedAt: string;
    batchId?: string | undefined;
    completedAt?: string | undefined;
}>;
export declare const fxQuoteSchema: z.ZodObject<{
    id: z.ZodString;
    fromCurrency: z.ZodString;
    toCurrency: z.ZodString;
    rate: z.ZodString;
    expiresAt: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    fromCurrency: string;
    toCurrency: string;
    rate: string;
    expiresAt: string;
}, {
    id: string;
    fromCurrency: string;
    toCurrency: string;
    rate: string;
    expiresAt: string;
}>;
export declare const billPaymentSchema: z.ZodObject<{
    id: z.ZodString;
    merchantId: z.ZodString;
    amount: z.ZodString;
    asset: z.ZodString;
    billerReference: z.ZodString;
    status: z.ZodEnum<["initiated", "paid", "failed"]>;
    createdAt: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    status: "initiated" | "failed" | "paid";
    asset: string;
    amount: string;
    merchantId: string;
    billerReference: string;
}, {
    id: string;
    createdAt: string;
    status: "initiated" | "failed" | "paid";
    asset: string;
    amount: string;
    merchantId: string;
    billerReference: string;
}>;
export declare const anchorTransferSchema: z.ZodObject<{
    id: z.ZodString;
    anchorName: z.ZodString;
    amount: z.ZodString;
    asset: z.ZodString;
    externalReference: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<["pending", "completed", "failed"]>;
    createdAt: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    status: "completed" | "failed" | "pending";
    asset: string;
    amount: string;
    anchorName: string;
    externalReference?: string | undefined;
}, {
    id: string;
    createdAt: string;
    status: "completed" | "failed" | "pending";
    asset: string;
    amount: string;
    anchorName: string;
    externalReference?: string | undefined;
}>;
export declare const paymentInitiatedEvent: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"PaymentInitiated">;
    occurredAt: z.ZodEffects<z.ZodString, string, string>;
    payload: z.ZodObject<{
        payment: z.ZodObject<{
            id: z.ZodString;
            merchantId: z.ZodString;
            payerId: z.ZodOptional<z.ZodString>;
            amount: z.ZodString;
            asset: z.ZodString;
            status: z.ZodEnum<["initiated", "completed", "failed", "cancelled"]>;
            createdAt: z.ZodEffects<z.ZodString, string, string>;
            reference: z.ZodOptional<z.ZodString>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        }, {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
    }, {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "PaymentInitiated";
    occurredAt: string;
    payload: {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
    };
}, {
    id: string;
    type: "PaymentInitiated";
    occurredAt: string;
    payload: {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
    };
}>;
export declare const paymentCompletedEvent: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"PaymentCompleted">;
    occurredAt: z.ZodEffects<z.ZodString, string, string>;
    payload: z.ZodObject<{
        payment: z.ZodObject<{
            id: z.ZodString;
            merchantId: z.ZodString;
            payerId: z.ZodOptional<z.ZodString>;
            amount: z.ZodString;
            asset: z.ZodString;
            status: z.ZodEnum<["initiated", "completed", "failed", "cancelled"]>;
            createdAt: z.ZodEffects<z.ZodString, string, string>;
            reference: z.ZodOptional<z.ZodString>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        }, {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        }>;
        transaction: z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<["payment", "settlement", "anchor_transfer", "fx"]>;
            amount: z.ZodString;
            asset: z.ZodString;
            from: z.ZodNullable<z.ZodString>;
            to: z.ZodNullable<z.ZodString>;
            createdAt: z.ZodEffects<z.ZodString, string, string>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        }, {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
    }, {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "PaymentCompleted";
    occurredAt: string;
    payload: {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
    };
}, {
    id: string;
    type: "PaymentCompleted";
    occurredAt: string;
    payload: {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
    };
}>;
export declare const settlementTriggeredEvent: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"SettlementTriggered">;
    occurredAt: z.ZodEffects<z.ZodString, string, string>;
    payload: z.ZodObject<{
        settlement: z.ZodObject<{
            id: z.ZodString;
            merchantId: z.ZodString;
            totalAmount: z.ZodString;
            grossAmount: z.ZodString;
            feeAmount: z.ZodString;
            netAmount: z.ZodString;
            feeBps: z.ZodNumber;
            asset: z.ZodString;
            batchId: z.ZodOptional<z.ZodString>;
            initiatedAt: z.ZodEffects<z.ZodString, string, string>;
            completedAt: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            status: z.ZodEnum<["pending", "processing", "completed", "failed"]>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            status: "completed" | "failed" | "pending" | "processing";
            asset: string;
            merchantId: string;
            totalAmount: string;
            grossAmount: string;
            feeAmount: string;
            netAmount: string;
            feeBps: number;
            initiatedAt: string;
            batchId?: string | undefined;
            completedAt?: string | undefined;
        }, {
            id: string;
            status: "completed" | "failed" | "pending" | "processing";
            asset: string;
            merchantId: string;
            totalAmount: string;
            grossAmount: string;
            feeAmount: string;
            netAmount: string;
            feeBps: number;
            initiatedAt: string;
            batchId?: string | undefined;
            completedAt?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        settlement: {
            id: string;
            status: "completed" | "failed" | "pending" | "processing";
            asset: string;
            merchantId: string;
            totalAmount: string;
            grossAmount: string;
            feeAmount: string;
            netAmount: string;
            feeBps: number;
            initiatedAt: string;
            batchId?: string | undefined;
            completedAt?: string | undefined;
        };
    }, {
        settlement: {
            id: string;
            status: "completed" | "failed" | "pending" | "processing";
            asset: string;
            merchantId: string;
            totalAmount: string;
            grossAmount: string;
            feeAmount: string;
            netAmount: string;
            feeBps: number;
            initiatedAt: string;
            batchId?: string | undefined;
            completedAt?: string | undefined;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "SettlementTriggered";
    occurredAt: string;
    payload: {
        settlement: {
            id: string;
            status: "completed" | "failed" | "pending" | "processing";
            asset: string;
            merchantId: string;
            totalAmount: string;
            grossAmount: string;
            feeAmount: string;
            netAmount: string;
            feeBps: number;
            initiatedAt: string;
            batchId?: string | undefined;
            completedAt?: string | undefined;
        };
    };
}, {
    id: string;
    type: "SettlementTriggered";
    occurredAt: string;
    payload: {
        settlement: {
            id: string;
            status: "completed" | "failed" | "pending" | "processing";
            asset: string;
            merchantId: string;
            totalAmount: string;
            grossAmount: string;
            feeAmount: string;
            netAmount: string;
            feeBps: number;
            initiatedAt: string;
            batchId?: string | undefined;
            completedAt?: string | undefined;
        };
    };
}>;
export declare const fxExecutedEvent: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"FXExecuted">;
    occurredAt: z.ZodEffects<z.ZodString, string, string>;
    payload: z.ZodObject<{
        quote: z.ZodObject<{
            id: z.ZodString;
            fromCurrency: z.ZodString;
            toCurrency: z.ZodString;
            rate: z.ZodString;
            expiresAt: z.ZodEffects<z.ZodString, string, string>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            fromCurrency: string;
            toCurrency: string;
            rate: string;
            expiresAt: string;
        }, {
            id: string;
            fromCurrency: string;
            toCurrency: string;
            rate: string;
            expiresAt: string;
        }>;
        transaction: z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<["payment", "settlement", "anchor_transfer", "fx"]>;
            amount: z.ZodString;
            asset: z.ZodString;
            from: z.ZodNullable<z.ZodString>;
            to: z.ZodNullable<z.ZodString>;
            createdAt: z.ZodEffects<z.ZodString, string, string>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        }, {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
        quote: {
            id: string;
            fromCurrency: string;
            toCurrency: string;
            rate: string;
            expiresAt: string;
        };
    }, {
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
        quote: {
            id: string;
            fromCurrency: string;
            toCurrency: string;
            rate: string;
            expiresAt: string;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "FXExecuted";
    occurredAt: string;
    payload: {
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
        quote: {
            id: string;
            fromCurrency: string;
            toCurrency: string;
            rate: string;
            expiresAt: string;
        };
    };
}, {
    id: string;
    type: "FXExecuted";
    occurredAt: string;
    payload: {
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
        quote: {
            id: string;
            fromCurrency: string;
            toCurrency: string;
            rate: string;
            expiresAt: string;
        };
    };
}>;
export declare const billPaidEvent: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"BillPaid">;
    occurredAt: z.ZodEffects<z.ZodString, string, string>;
    payload: z.ZodObject<{
        billPayment: z.ZodObject<{
            id: z.ZodString;
            merchantId: z.ZodString;
            amount: z.ZodString;
            asset: z.ZodString;
            billerReference: z.ZodString;
            status: z.ZodEnum<["initiated", "paid", "failed"]>;
            createdAt: z.ZodEffects<z.ZodString, string, string>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            createdAt: string;
            status: "initiated" | "failed" | "paid";
            asset: string;
            amount: string;
            merchantId: string;
            billerReference: string;
        }, {
            id: string;
            createdAt: string;
            status: "initiated" | "failed" | "paid";
            asset: string;
            amount: string;
            merchantId: string;
            billerReference: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        billPayment: {
            id: string;
            createdAt: string;
            status: "initiated" | "failed" | "paid";
            asset: string;
            amount: string;
            merchantId: string;
            billerReference: string;
        };
    }, {
        billPayment: {
            id: string;
            createdAt: string;
            status: "initiated" | "failed" | "paid";
            asset: string;
            amount: string;
            merchantId: string;
            billerReference: string;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "BillPaid";
    occurredAt: string;
    payload: {
        billPayment: {
            id: string;
            createdAt: string;
            status: "initiated" | "failed" | "paid";
            asset: string;
            amount: string;
            merchantId: string;
            billerReference: string;
        };
    };
}, {
    id: string;
    type: "BillPaid";
    occurredAt: string;
    payload: {
        billPayment: {
            id: string;
            createdAt: string;
            status: "initiated" | "failed" | "paid";
            asset: string;
            amount: string;
            merchantId: string;
            billerReference: string;
        };
    };
}>;
export declare const anchorSettledEvent: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"AnchorSettled">;
    occurredAt: z.ZodEffects<z.ZodString, string, string>;
    payload: z.ZodObject<{
        anchorTransfer: z.ZodObject<{
            id: z.ZodString;
            anchorName: z.ZodString;
            amount: z.ZodString;
            asset: z.ZodString;
            externalReference: z.ZodOptional<z.ZodString>;
            status: z.ZodEnum<["pending", "completed", "failed"]>;
            createdAt: z.ZodEffects<z.ZodString, string, string>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            createdAt: string;
            status: "completed" | "failed" | "pending";
            asset: string;
            amount: string;
            anchorName: string;
            externalReference?: string | undefined;
        }, {
            id: string;
            createdAt: string;
            status: "completed" | "failed" | "pending";
            asset: string;
            amount: string;
            anchorName: string;
            externalReference?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        anchorTransfer: {
            id: string;
            createdAt: string;
            status: "completed" | "failed" | "pending";
            asset: string;
            amount: string;
            anchorName: string;
            externalReference?: string | undefined;
        };
    }, {
        anchorTransfer: {
            id: string;
            createdAt: string;
            status: "completed" | "failed" | "pending";
            asset: string;
            amount: string;
            anchorName: string;
            externalReference?: string | undefined;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "AnchorSettled";
    occurredAt: string;
    payload: {
        anchorTransfer: {
            id: string;
            createdAt: string;
            status: "completed" | "failed" | "pending";
            asset: string;
            amount: string;
            anchorName: string;
            externalReference?: string | undefined;
        };
    };
}, {
    id: string;
    type: "AnchorSettled";
    occurredAt: string;
    payload: {
        anchorTransfer: {
            id: string;
            createdAt: string;
            status: "completed" | "failed" | "pending";
            asset: string;
            amount: string;
            anchorName: string;
            externalReference?: string | undefined;
        };
    };
}>;
export declare const eventSchemas: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"PaymentInitiated">;
    occurredAt: z.ZodEffects<z.ZodString, string, string>;
    payload: z.ZodObject<{
        payment: z.ZodObject<{
            id: z.ZodString;
            merchantId: z.ZodString;
            payerId: z.ZodOptional<z.ZodString>;
            amount: z.ZodString;
            asset: z.ZodString;
            status: z.ZodEnum<["initiated", "completed", "failed", "cancelled"]>;
            createdAt: z.ZodEffects<z.ZodString, string, string>;
            reference: z.ZodOptional<z.ZodString>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        }, {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
    }, {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "PaymentInitiated";
    occurredAt: string;
    payload: {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
    };
}, {
    id: string;
    type: "PaymentInitiated";
    occurredAt: string;
    payload: {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
    };
}>, z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"PaymentCompleted">;
    occurredAt: z.ZodEffects<z.ZodString, string, string>;
    payload: z.ZodObject<{
        payment: z.ZodObject<{
            id: z.ZodString;
            merchantId: z.ZodString;
            payerId: z.ZodOptional<z.ZodString>;
            amount: z.ZodString;
            asset: z.ZodString;
            status: z.ZodEnum<["initiated", "completed", "failed", "cancelled"]>;
            createdAt: z.ZodEffects<z.ZodString, string, string>;
            reference: z.ZodOptional<z.ZodString>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        }, {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        }>;
        transaction: z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<["payment", "settlement", "anchor_transfer", "fx"]>;
            amount: z.ZodString;
            asset: z.ZodString;
            from: z.ZodNullable<z.ZodString>;
            to: z.ZodNullable<z.ZodString>;
            createdAt: z.ZodEffects<z.ZodString, string, string>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        }, {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
    }, {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "PaymentCompleted";
    occurredAt: string;
    payload: {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
    };
}, {
    id: string;
    type: "PaymentCompleted";
    occurredAt: string;
    payload: {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
    };
}>, z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"SettlementTriggered">;
    occurredAt: z.ZodEffects<z.ZodString, string, string>;
    payload: z.ZodObject<{
        settlement: z.ZodObject<{
            id: z.ZodString;
            merchantId: z.ZodString;
            totalAmount: z.ZodString;
            grossAmount: z.ZodString;
            feeAmount: z.ZodString;
            netAmount: z.ZodString;
            feeBps: z.ZodNumber;
            asset: z.ZodString;
            batchId: z.ZodOptional<z.ZodString>;
            initiatedAt: z.ZodEffects<z.ZodString, string, string>;
            completedAt: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            status: z.ZodEnum<["pending", "processing", "completed", "failed"]>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            status: "completed" | "failed" | "pending" | "processing";
            asset: string;
            merchantId: string;
            totalAmount: string;
            grossAmount: string;
            feeAmount: string;
            netAmount: string;
            feeBps: number;
            initiatedAt: string;
            batchId?: string | undefined;
            completedAt?: string | undefined;
        }, {
            id: string;
            status: "completed" | "failed" | "pending" | "processing";
            asset: string;
            merchantId: string;
            totalAmount: string;
            grossAmount: string;
            feeAmount: string;
            netAmount: string;
            feeBps: number;
            initiatedAt: string;
            batchId?: string | undefined;
            completedAt?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        settlement: {
            id: string;
            status: "completed" | "failed" | "pending" | "processing";
            asset: string;
            merchantId: string;
            totalAmount: string;
            grossAmount: string;
            feeAmount: string;
            netAmount: string;
            feeBps: number;
            initiatedAt: string;
            batchId?: string | undefined;
            completedAt?: string | undefined;
        };
    }, {
        settlement: {
            id: string;
            status: "completed" | "failed" | "pending" | "processing";
            asset: string;
            merchantId: string;
            totalAmount: string;
            grossAmount: string;
            feeAmount: string;
            netAmount: string;
            feeBps: number;
            initiatedAt: string;
            batchId?: string | undefined;
            completedAt?: string | undefined;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "SettlementTriggered";
    occurredAt: string;
    payload: {
        settlement: {
            id: string;
            status: "completed" | "failed" | "pending" | "processing";
            asset: string;
            merchantId: string;
            totalAmount: string;
            grossAmount: string;
            feeAmount: string;
            netAmount: string;
            feeBps: number;
            initiatedAt: string;
            batchId?: string | undefined;
            completedAt?: string | undefined;
        };
    };
}, {
    id: string;
    type: "SettlementTriggered";
    occurredAt: string;
    payload: {
        settlement: {
            id: string;
            status: "completed" | "failed" | "pending" | "processing";
            asset: string;
            merchantId: string;
            totalAmount: string;
            grossAmount: string;
            feeAmount: string;
            netAmount: string;
            feeBps: number;
            initiatedAt: string;
            batchId?: string | undefined;
            completedAt?: string | undefined;
        };
    };
}>, z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"FXExecuted">;
    occurredAt: z.ZodEffects<z.ZodString, string, string>;
    payload: z.ZodObject<{
        quote: z.ZodObject<{
            id: z.ZodString;
            fromCurrency: z.ZodString;
            toCurrency: z.ZodString;
            rate: z.ZodString;
            expiresAt: z.ZodEffects<z.ZodString, string, string>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            fromCurrency: string;
            toCurrency: string;
            rate: string;
            expiresAt: string;
        }, {
            id: string;
            fromCurrency: string;
            toCurrency: string;
            rate: string;
            expiresAt: string;
        }>;
        transaction: z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<["payment", "settlement", "anchor_transfer", "fx"]>;
            amount: z.ZodString;
            asset: z.ZodString;
            from: z.ZodNullable<z.ZodString>;
            to: z.ZodNullable<z.ZodString>;
            createdAt: z.ZodEffects<z.ZodString, string, string>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        }, {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
        quote: {
            id: string;
            fromCurrency: string;
            toCurrency: string;
            rate: string;
            expiresAt: string;
        };
    }, {
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
        quote: {
            id: string;
            fromCurrency: string;
            toCurrency: string;
            rate: string;
            expiresAt: string;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "FXExecuted";
    occurredAt: string;
    payload: {
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
        quote: {
            id: string;
            fromCurrency: string;
            toCurrency: string;
            rate: string;
            expiresAt: string;
        };
    };
}, {
    id: string;
    type: "FXExecuted";
    occurredAt: string;
    payload: {
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
        quote: {
            id: string;
            fromCurrency: string;
            toCurrency: string;
            rate: string;
            expiresAt: string;
        };
    };
}>, z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"BillPaid">;
    occurredAt: z.ZodEffects<z.ZodString, string, string>;
    payload: z.ZodObject<{
        billPayment: z.ZodObject<{
            id: z.ZodString;
            merchantId: z.ZodString;
            amount: z.ZodString;
            asset: z.ZodString;
            billerReference: z.ZodString;
            status: z.ZodEnum<["initiated", "paid", "failed"]>;
            createdAt: z.ZodEffects<z.ZodString, string, string>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            createdAt: string;
            status: "initiated" | "failed" | "paid";
            asset: string;
            amount: string;
            merchantId: string;
            billerReference: string;
        }, {
            id: string;
            createdAt: string;
            status: "initiated" | "failed" | "paid";
            asset: string;
            amount: string;
            merchantId: string;
            billerReference: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        billPayment: {
            id: string;
            createdAt: string;
            status: "initiated" | "failed" | "paid";
            asset: string;
            amount: string;
            merchantId: string;
            billerReference: string;
        };
    }, {
        billPayment: {
            id: string;
            createdAt: string;
            status: "initiated" | "failed" | "paid";
            asset: string;
            amount: string;
            merchantId: string;
            billerReference: string;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "BillPaid";
    occurredAt: string;
    payload: {
        billPayment: {
            id: string;
            createdAt: string;
            status: "initiated" | "failed" | "paid";
            asset: string;
            amount: string;
            merchantId: string;
            billerReference: string;
        };
    };
}, {
    id: string;
    type: "BillPaid";
    occurredAt: string;
    payload: {
        billPayment: {
            id: string;
            createdAt: string;
            status: "initiated" | "failed" | "paid";
            asset: string;
            amount: string;
            merchantId: string;
            billerReference: string;
        };
    };
}>, z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"AnchorSettled">;
    occurredAt: z.ZodEffects<z.ZodString, string, string>;
    payload: z.ZodObject<{
        anchorTransfer: z.ZodObject<{
            id: z.ZodString;
            anchorName: z.ZodString;
            amount: z.ZodString;
            asset: z.ZodString;
            externalReference: z.ZodOptional<z.ZodString>;
            status: z.ZodEnum<["pending", "completed", "failed"]>;
            createdAt: z.ZodEffects<z.ZodString, string, string>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            createdAt: string;
            status: "completed" | "failed" | "pending";
            asset: string;
            amount: string;
            anchorName: string;
            externalReference?: string | undefined;
        }, {
            id: string;
            createdAt: string;
            status: "completed" | "failed" | "pending";
            asset: string;
            amount: string;
            anchorName: string;
            externalReference?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        anchorTransfer: {
            id: string;
            createdAt: string;
            status: "completed" | "failed" | "pending";
            asset: string;
            amount: string;
            anchorName: string;
            externalReference?: string | undefined;
        };
    }, {
        anchorTransfer: {
            id: string;
            createdAt: string;
            status: "completed" | "failed" | "pending";
            asset: string;
            amount: string;
            anchorName: string;
            externalReference?: string | undefined;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "AnchorSettled";
    occurredAt: string;
    payload: {
        anchorTransfer: {
            id: string;
            createdAt: string;
            status: "completed" | "failed" | "pending";
            asset: string;
            amount: string;
            anchorName: string;
            externalReference?: string | undefined;
        };
    };
}, {
    id: string;
    type: "AnchorSettled";
    occurredAt: string;
    payload: {
        anchorTransfer: {
            id: string;
            createdAt: string;
            status: "completed" | "failed" | "pending";
            asset: string;
            amount: string;
            anchorName: string;
            externalReference?: string | undefined;
        };
    };
}>]>;
export type User = z.infer<typeof userSchema>;
export type Merchant = z.infer<typeof merchantSchema>;
export type Wallet = z.infer<typeof walletSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type Settlement = z.infer<typeof settlementSchema>;
export type FXQuote = z.infer<typeof fxQuoteSchema>;
export type BillPayment = z.infer<typeof billPaymentSchema>;
export type AnchorTransfer = z.infer<typeof anchorTransferSchema>;
export type EventPayloads = z.infer<typeof eventSchemas>;
export declare function parseEvent(raw: unknown): {
    id: string;
    type: "PaymentInitiated";
    occurredAt: string;
    payload: {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
    };
} | {
    id: string;
    type: "PaymentCompleted";
    occurredAt: string;
    payload: {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
    };
} | {
    id: string;
    type: "SettlementTriggered";
    occurredAt: string;
    payload: {
        settlement: {
            id: string;
            status: "completed" | "failed" | "pending" | "processing";
            asset: string;
            merchantId: string;
            totalAmount: string;
            grossAmount: string;
            feeAmount: string;
            netAmount: string;
            feeBps: number;
            initiatedAt: string;
            batchId?: string | undefined;
            completedAt?: string | undefined;
        };
    };
} | {
    id: string;
    type: "FXExecuted";
    occurredAt: string;
    payload: {
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
        quote: {
            id: string;
            fromCurrency: string;
            toCurrency: string;
            rate: string;
            expiresAt: string;
        };
    };
} | {
    id: string;
    type: "BillPaid";
    occurredAt: string;
    payload: {
        billPayment: {
            id: string;
            createdAt: string;
            status: "initiated" | "failed" | "paid";
            asset: string;
            amount: string;
            merchantId: string;
            billerReference: string;
        };
    };
} | {
    id: string;
    type: "AnchorSettled";
    occurredAt: string;
    payload: {
        anchorTransfer: {
            id: string;
            createdAt: string;
            status: "completed" | "failed" | "pending";
            asset: string;
            amount: string;
            anchorName: string;
            externalReference?: string | undefined;
        };
    };
};
export declare function safeParseEvent(raw: unknown): z.SafeParseReturnType<{
    id: string;
    type: "PaymentInitiated";
    occurredAt: string;
    payload: {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
    };
} | {
    id: string;
    type: "PaymentCompleted";
    occurredAt: string;
    payload: {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
    };
} | {
    id: string;
    type: "SettlementTriggered";
    occurredAt: string;
    payload: {
        settlement: {
            id: string;
            status: "completed" | "failed" | "pending" | "processing";
            asset: string;
            merchantId: string;
            totalAmount: string;
            grossAmount: string;
            feeAmount: string;
            netAmount: string;
            feeBps: number;
            initiatedAt: string;
            batchId?: string | undefined;
            completedAt?: string | undefined;
        };
    };
} | {
    id: string;
    type: "FXExecuted";
    occurredAt: string;
    payload: {
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
        quote: {
            id: string;
            fromCurrency: string;
            toCurrency: string;
            rate: string;
            expiresAt: string;
        };
    };
} | {
    id: string;
    type: "BillPaid";
    occurredAt: string;
    payload: {
        billPayment: {
            id: string;
            createdAt: string;
            status: "initiated" | "failed" | "paid";
            asset: string;
            amount: string;
            merchantId: string;
            billerReference: string;
        };
    };
} | {
    id: string;
    type: "AnchorSettled";
    occurredAt: string;
    payload: {
        anchorTransfer: {
            id: string;
            createdAt: string;
            status: "completed" | "failed" | "pending";
            asset: string;
            amount: string;
            anchorName: string;
            externalReference?: string | undefined;
        };
    };
}, {
    id: string;
    type: "PaymentInitiated";
    occurredAt: string;
    payload: {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
    };
} | {
    id: string;
    type: "PaymentCompleted";
    occurredAt: string;
    payload: {
        payment: {
            id: string;
            createdAt: string;
            status: "initiated" | "completed" | "failed" | "cancelled";
            asset: string;
            amount: string;
            merchantId: string;
            metadata?: Record<string, any> | undefined;
            payerId?: string | undefined;
            reference?: string | undefined;
        };
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
    };
} | {
    id: string;
    type: "SettlementTriggered";
    occurredAt: string;
    payload: {
        settlement: {
            id: string;
            status: "completed" | "failed" | "pending" | "processing";
            asset: string;
            merchantId: string;
            totalAmount: string;
            grossAmount: string;
            feeAmount: string;
            netAmount: string;
            feeBps: number;
            initiatedAt: string;
            batchId?: string | undefined;
            completedAt?: string | undefined;
        };
    };
} | {
    id: string;
    type: "FXExecuted";
    occurredAt: string;
    payload: {
        transaction: {
            id: string;
            createdAt: string;
            type: "payment" | "settlement" | "anchor_transfer" | "fx";
            asset: string;
            amount: string;
            from: string | null;
            to: string | null;
            metadata?: Record<string, any> | undefined;
        };
        quote: {
            id: string;
            fromCurrency: string;
            toCurrency: string;
            rate: string;
            expiresAt: string;
        };
    };
} | {
    id: string;
    type: "BillPaid";
    occurredAt: string;
    payload: {
        billPayment: {
            id: string;
            createdAt: string;
            status: "initiated" | "failed" | "paid";
            asset: string;
            amount: string;
            merchantId: string;
            billerReference: string;
        };
    };
} | {
    id: string;
    type: "AnchorSettled";
    occurredAt: string;
    payload: {
        anchorTransfer: {
            id: string;
            createdAt: string;
            status: "completed" | "failed" | "pending";
            asset: string;
            amount: string;
            anchorName: string;
            externalReference?: string | undefined;
        };
    };
}>;
export declare const WebhookUrlSchema: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
export type WebhookUrl = z.infer<typeof WebhookUrlSchema>;
export declare const CreateMerchantBody: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    ownerId: z.ZodOptional<z.ZodString>;
    settings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    secret: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    ownerId?: string | undefined;
    settings?: Record<string, unknown> | undefined;
    secret?: string | undefined;
}, {
    id: string;
    name: string;
    ownerId?: string | undefined;
    settings?: Record<string, unknown> | undefined;
    secret?: string | undefined;
}>;
export declare const CreatePaymentBody: z.ZodObject<{
    merchantId: z.ZodString;
    amount: z.ZodString;
    asset: z.ZodString;
    payerId: z.ZodOptional<z.ZodString>;
    reference: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    asset: string;
    amount: string;
    merchantId: string;
    payerId?: string | undefined;
    reference?: string | undefined;
}, {
    asset: string;
    amount: string;
    merchantId: string;
    payerId?: string | undefined;
    reference?: string | undefined;
}>;
export declare const CreateSettlementBody: z.ZodEffects<z.ZodObject<{
    merchantId: z.ZodString;
    amount: z.ZodOptional<z.ZodString>;
    asset: z.ZodOptional<z.ZodString>;
    items: z.ZodOptional<z.ZodArray<z.ZodObject<{
        amount: z.ZodString;
        asset: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        asset: string;
        amount: string;
    }, {
        asset: string;
        amount: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    merchantId: string;
    asset?: string | undefined;
    amount?: string | undefined;
    items?: {
        asset: string;
        amount: string;
    }[] | undefined;
}, {
    merchantId: string;
    asset?: string | undefined;
    amount?: string | undefined;
    items?: {
        asset: string;
        amount: string;
    }[] | undefined;
}>, {
    merchantId: string;
    asset?: string | undefined;
    amount?: string | undefined;
    items?: {
        asset: string;
        amount: string;
    }[] | undefined;
}, {
    merchantId: string;
    asset?: string | undefined;
    amount?: string | undefined;
    items?: {
        asset: string;
        amount: string;
    }[] | undefined;
}>;
export declare const AuthTokenBody: z.ZodObject<{
    merchantId: z.ZodString;
    secret: z.ZodString;
}, "strip", z.ZodTypeAny, {
    merchantId: string;
    secret: string;
}, {
    merchantId: string;
    secret: string;
}>;
export declare const UpdatePaymentStatusBody: z.ZodObject<{
    status: z.ZodEnum<["completed", "failed", "cancelled"]>;
}, "strip", z.ZodTypeAny, {
    status: "completed" | "failed" | "cancelled";
}, {
    status: "completed" | "failed" | "cancelled";
}>;
export declare const UpdateMerchantSettingsBody: z.ZodObject<{
    feeBps: z.ZodOptional<z.ZodNumber>;
    tier: z.ZodOptional<z.ZodString>;
    minSettlementAmount: z.ZodOptional<z.ZodString>;
    maxSettlementAmount: z.ZodOptional<z.ZodString>;
    dailySettlementLimit: z.ZodOptional<z.ZodString>;
    webhookUrl: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
}, "strip", z.ZodTypeAny, {
    feeBps?: number | undefined;
    tier?: string | undefined;
    minSettlementAmount?: string | undefined;
    maxSettlementAmount?: string | undefined;
    dailySettlementLimit?: string | undefined;
    webhookUrl?: string | undefined;
}, {
    feeBps?: number | undefined;
    tier?: string | undefined;
    minSettlementAmount?: string | undefined;
    maxSettlementAmount?: string | undefined;
    dailySettlementLimit?: string | undefined;
    webhookUrl?: string | undefined;
}>;
export declare const PaginationQuery: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    offset: number;
}, {
    limit?: number | undefined;
    offset?: number | undefined;
}>;
export type PaginationQuery = z.infer<typeof PaginationQuery>;
export declare const SettlementListQuery: z.ZodEffects<z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
} & {
    status: z.ZodOptional<z.ZodEnum<["pending", "processing", "completed", "failed"]>>;
    from: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    to: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    offset: number;
    status?: "completed" | "failed" | "pending" | "processing" | undefined;
    from?: string | undefined;
    to?: string | undefined;
}, {
    status?: "completed" | "failed" | "pending" | "processing" | undefined;
    from?: string | undefined;
    to?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
}>, {
    limit: number;
    offset: number;
    status?: "completed" | "failed" | "pending" | "processing" | undefined;
    from?: string | undefined;
    to?: string | undefined;
}, {
    status?: "completed" | "failed" | "pending" | "processing" | undefined;
    from?: string | undefined;
    to?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
}>;
export type SettlementListQuery = z.infer<typeof SettlementListQuery>;
export declare const DateRangeQuery: z.ZodEffects<z.ZodObject<{
    from: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    to: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>>;
}, "strip", z.ZodTypeAny, {
    to: string;
    from?: string | undefined;
}, {
    from?: string | undefined;
    to?: string | undefined;
}>, {
    to: string;
    from?: string | undefined;
}, {
    from?: string | undefined;
    to?: string | undefined;
}>;
export type DateRangeQuery = z.infer<typeof DateRangeQuery>;
export type CreateMerchantBody = z.infer<typeof CreateMerchantBody>;
export type CreatePaymentBody = z.infer<typeof CreatePaymentBody>;
export type CreateSettlementBody = z.infer<typeof CreateSettlementBody>;
export type AuthTokenBody = z.infer<typeof AuthTokenBody>;
export type UpdatePaymentStatusBody = z.infer<typeof UpdatePaymentStatusBody>;
export type UpdateMerchantSettingsBody = z.infer<typeof UpdateMerchantSettingsBody>;
export declare const EVENT_TYPES: readonly ["PaymentInitiated", "PaymentCompleted", "SettlementTriggered", "FXExecuted", "BillPaid", "AnchorSettled"];
export type EventType = (typeof EVENT_TYPES)[number];
export interface IndexedEvent {
    id: string;
    stellarId?: string | null;
    contractId: string;
    topics: string[];
    type: EventType;
    rawValue: string;
    decodedPayload?: unknown;
    ledger: number;
    indexedAt: string;
}
//# sourceMappingURL=schemas.d.ts.map