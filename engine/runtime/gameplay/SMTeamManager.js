(function(){
    'use strict';
    class SMTeamManager{
        constructor(){
            this.teams=new Map();
            this.membership=new Map();
            this.attitudes=new Map();
        }
        createTeam(id,options={}){
            const key=String(id);
            const team={id:key,name:String(options.name||key),displayName:String(options.displayName||options.name||key),members:new Set(),score:Number(options.score||0),metadata:{...(options.metadata||{})}};
            this.teams.set(key,team);
            if(!this.attitudes.has(key))this.attitudes.set(key,new Map());
            return team;
        }
        removeTeam(id){
            const key=String(id);
            const team=this.teams.get(key);
            if(!team)return false;
            for(const memberId of team.members)this.membership.delete(memberId);
            this.teams.delete(key);
            this.attitudes.delete(key);
            for(const map of this.attitudes.values())map.delete(key);
            return true;
        }
        getTeam(id){
            return this.teams.get(String(id))||null;
        }
        addMember(teamId,member){
            const team=this.getTeam(teamId)||this.createTeam(teamId);
            const memberId=this._memberId(member);
            const previousTeamId=this.membership.get(memberId);
            if(previousTeamId&&previousTeamId!==team.id)this.removeMember(member);
            team.members.add(memberId);
            this.membership.set(memberId,team.id);
            window.SMRuntimeEventBus?.emit?.('gameplay:team-member-added',{manager:this,team,teamId:team.id,member,memberId});
            return team;
        }
        removeMember(member){
            const memberId=this._memberId(member);
            const teamId=this.membership.get(memberId);
            if(!teamId)return false;
            const team=this.teams.get(teamId);
            team?.members?.delete(memberId);
            this.membership.delete(memberId);
            window.SMRuntimeEventBus?.emit?.('gameplay:team-member-removed',{manager:this,team,teamId,member,memberId});
            return true;
        }
        getTeamOf(member){
            const id=this.membership.get(this._memberId(member));
            return id?this.teams.get(id)||null:null;
        }
        setAttitude(teamA,teamB,attitude='neutral',options={}){
            const a=String(teamA);
            const b=String(teamB);
            const value=this._normalizeAttitude(attitude);
            if(!this.teams.has(a))this.createTeam(a);
            if(!this.teams.has(b))this.createTeam(b);
            if(!this.attitudes.has(a))this.attitudes.set(a,new Map());
            this.attitudes.get(a).set(b,value);
            if(options.symmetric!==false){
                if(!this.attitudes.has(b))this.attitudes.set(b,new Map());
                this.attitudes.get(b).set(a,value);
            }
            return value;
        }
        getAttitude(teamA,teamB){
            const a=String(teamA?.id||teamA||'');
            const b=String(teamB?.id||teamB||'');
            if(!a||!b)return'neutral';
            if(a===b)return'friendly';
            return this.attitudes.get(a)?.get(b)||'neutral';
        }
        getAttitudeBetween(memberA,memberB){
            const a=this.getTeamOf(memberA);
            const b=this.getTeamOf(memberB);
            return this.getAttitude(a?.id,b?.id);
        }
        areFriendly(a,b){
            return this.getAttitudeBetween(a,b)==='friendly';
        }
        areHostile(a,b){
            return this.getAttitudeBetween(a,b)==='hostile';
        }
        addScore(teamId,amount=1){
            const team=this.getTeam(teamId)||this.createTeam(teamId);
            team.score+=Number(amount)||0;
            window.SMRuntimeEventBus?.emit?.('gameplay:team-score-changed',{manager:this,team,score:team.score});
            return team.score;
        }
        setScore(teamId,score){
            const team=this.getTeam(teamId)||this.createTeam(teamId);
            team.score=Number(score)||0;
            return team.score;
        }
        getScore(teamId){
            return this.getTeam(teamId)?.score||0;
        }
        list(){
            return Array.from(this.teams.values());
        }
        reset(options={}){
            this.membership.clear();
            for(const team of this.teams.values()){
                team.members.clear();
                if(options.keepScores!==true)team.score=0;
            }
            if(options.keepTeams!==true){
                this.teams.clear();
                this.attitudes.clear();
            }
            return true;
        }
        serialize(){
            return{teams:this.list().map(team=>({id:team.id,name:team.name,displayName:team.displayName,score:team.score,members:Array.from(team.members),metadata:{...team.metadata}})),attitudes:Object.fromEntries(Array.from(this.attitudes,([id,map])=>[id,Object.fromEntries(map)]))};
        }
        _memberId(member){
            return String(member?.id||member?.object?.uuid||member?.uuid||member?.userData?.playerId||member||'');
        }
        _normalizeAttitude(value){
            const attitude=String(value||'neutral').toLowerCase();
            return['friendly','neutral','hostile'].includes(attitude)?attitude:'neutral';
        }
        debug(){
            const state={teams:this.list().map(team=>({id:team.id,members:team.members.size,score:team.score})),memberships:this.membership.size};
            console.log('[SMTeamManager]',state);
            return state;
        }
    }
    const manager=new SMTeamManager();
    window.SMTeamManagerClass=SMTeamManager;
    window.SMTeamManager=manager;
    window.smTeamManager=manager;
})();