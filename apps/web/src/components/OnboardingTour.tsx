import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Network, FileText, QrCode, ShieldCheck, ArrowRight, Check } from "lucide-react";

export function OnboardingTour() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0);

    useEffect(() => {
        const hasSeenTour = localStorage.getItem('mcc-demo-onboarding-seen');
        if (!hasSeenTour) {
            // Small delay to ensure app is ready
            setTimeout(() => setOpen(true), 1000);
        }
    }, []);

    const handleComplete = () => {
        localStorage.setItem('mcc-demo-onboarding-seen', 'true');
        setOpen(false);
    };

    const steps = [
        {
            title: "Welcome to MCC Letter Issuance",
            description: "This demo allows you to explore the secure letter issuance platform used by the BCBA.",
            icon: <ShieldCheck className="w-12 h-12 text-blue-500" />,
            content: "You will experience the full lifecycle of a document: from trusted creation to secure verification. Everything runs in a safe Demo Environment."
        },
        {
            title: "1. Create & Review Drafts",
            description: "Start by selecting a department and writing a draft.",
            icon: <FileText className="w-12 h-12 text-zinc-100" />,
            content: "The system ensures that whatever you write is securely stored. You can always click the Eye icon on any letter to review its full content exactly as it was saved."
        },
        {
            title: "2. Visual Status Tracking",
            description: "Watch the journey of your document.",
            icon: <Network className="w-12 h-12 text-blue-400" />,
            content: "Click the Network button on any letter to open the visual Node Graph. This tracks the letter through Drafting, Committee Approval, and Final Issuance in an intuitive, n8n-style view."
        },
        {
            title: "3. Verify with QR Codes",
            description: "The ultimate proof of authenticity.",
            icon: <QrCode className="w-12 h-12 text-green-400" />,
            content: "Once a letter is Issued, click the QR Code button. This generates a live verification code that links to the immutable record on the blockchain/database, ready for printing."
        }
    ];

    const currentStep = steps[step];

    return (
        <Dialog open={open} onOpenChange={(val) => !val && handleComplete()}>
            <DialogContent className="max-w-md bg-zinc-950 border-zinc-800">
                <DialogHeader>
                    <div className="flex justify-center mb-4">
                        {currentStep.icon}
                    </div>
                    <DialogTitle className="text-center text-xl text-white mb-2">{currentStep.title}</DialogTitle>
                    <DialogDescription className="text-center text-zinc-400 text-base">
                        {currentStep.description}
                    </DialogDescription>
                </DialogHeader>

                <div className="text-zinc-300 text-sm text-center px-4 my-2 leading-relaxed">
                    {currentStep.content}
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2 mt-6">
                    <div className="flex-1 flex items-center justify-center gap-1">
                        {steps.map((_, i) => (
                            <div
                                key={i}
                                className={`w-2 h-2 rounded-full transition-all ${i === step ? 'bg-blue-500 w-4' : 'bg-zinc-800'}`}
                            />
                        ))}
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        {step < steps.length - 1 ? (
                            <Button className="w-full sm:w-auto" onClick={() => setStep(s => s + 1)}>
                                Next
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        ) : (
                            <Button className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white" onClick={handleComplete}>
                                Get Started
                                <Check className="w-4 h-4 ml-2" />
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
