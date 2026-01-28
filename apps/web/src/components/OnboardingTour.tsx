import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Network, QrCode, ShieldCheck, ArrowRight, Check, User, Zap, Terminal } from "lucide-react";

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
            title: "Welcome to MCC Demo",
            description: "Experience the secure Blockchain-Verified Issuance Platform.",
            icon: <ShieldCheck className="w-12 h-12 text-blue-500" />,
            content: "We've added 'God Mode' tools to let you see the entire lifecycle in minutes. From drafting to printing secure QR-coded documents."
        },
        {
            title: "1. Role Switcher ('God Mode')",
            description: "Switch perspectives instantly in the Header.",
            icon: <User className="w-12 h-12 text-purple-400" />,
            content: "Toggle between 'Requester' (Draft), 'Approver' (Review), and 'Printer' (Issue) without logging out. See how the UI adapts to each permission level."
        },
        {
            title: "2. Scenario Simulator",
            description: "Use the floating Debug Menu (bottom right).",
            icon: <Zap className="w-12 h-12 text-yellow-400" />,
            content: "Need data? Click 'Generate 5 Drafts' to instantly populate the dashboard. You can also 'Approve All' to fast-forward the workflow."
        },
        {
            title: "3. Smart Features",
            description: "Custom Tags & Visual Tracking.",
            icon: <Network className="w-12 h-12 text-blue-400" />,
            content: "Add custom tags on the fly during drafting. Track the document's journey with the Node Graph (Network icon) to see the exact state trail."
        },
        {
            title: "4. Live Verification",
            description: "Real PDFs and Live QR Codes.",
            icon: <QrCode className="w-12 h-12 text-green-400" />,
            content: "Issue a letter to generate a Real PDF. Scan the QR code with your phone to verify its authenticity against the live demo database."
        },
        {
            title: "5. Live Security Stream",
            description: "Real-time audit log streaming.",
            icon: <Terminal className="w-12 h-12 text-zinc-500" />,
            content: "Watch the 'Matrix' style log at the footer. Every action you take is cryptographically logged and streamed in real-time."
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
