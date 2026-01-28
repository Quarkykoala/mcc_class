import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Shield, Printer, Eye } from "lucide-react";

export type DemoRole = 'REQUESTER' | 'APPROVER' | 'PRINTER' | 'AUDITOR';

interface DemoRoleSelectorProps {
    currentRole: DemoRole;
    onRoleChange: (role: DemoRole) => void;
}

export function DemoRoleSelector({ currentRole, onRoleChange }: DemoRoleSelectorProps) {
    return (
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-1 px-2 h-9">
            <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider hidden sm:block">Demo Role</span>
            <Select value={currentRole} onValueChange={(val) => onRoleChange(val as DemoRole)}>
                <SelectTrigger className="h-7 w-[160px] border-none bg-transparent hover:bg-zinc-800 text-xs focus:ring-0">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="REQUESTER">
                        <div className="flex items-center gap-2">
                            <User className="w-3 h-3 text-blue-400" />
                            <span>Company Requester</span>
                        </div>
                    </SelectItem>
                    <SelectItem value="APPROVER">
                        <div className="flex items-center gap-2">
                            <Shield className="w-3 h-3 text-purple-400" />
                            <span>Association Approver</span>
                        </div>
                    </SelectItem>
                    <SelectItem value="PRINTER">
                        <div className="flex items-center gap-2">
                            <Printer className="w-3 h-3 text-orange-400" />
                            <span>Factory Printer</span>
                        </div>
                    </SelectItem>
                    <SelectItem value="AUDITOR">
                        <div className="flex items-center gap-2">
                            <Eye className="w-3 h-3 text-green-400" />
                            <span>Gov Auditor</span>
                        </div>
                    </SelectItem>
                </SelectContent>
            </Select>
        </div>
    );
}
