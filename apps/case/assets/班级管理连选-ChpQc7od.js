import{n as e,r as t,t as n}from"./TableModel-AofuNmvH.js";import{t as r}from"./link--c7dvm0Y.js";import{$ as i,$i as a,Br as o,C as s,E as c,Ir as l,Kr as u,Lr as d,P as f,S as p,Tr as m,Vr as h,Wr as g,Xr as _,ai as v,f as y,ji as b,jr as x,kr as S,ni as C,s as w,vi as T,wi as E,xi as D,y as O,zi as k}from"./index-BgN02Kda.js";import A from"./班级管理_form-BKz-tLYz.js";D(),u(),m(),k();var j={__name:`班级管理连选`,setup(u){C(()=>{k()});let m=E({}),D=E({data:[],rowKey:`id`,rowName:`name`,columns:[{ellipsis:!0,width:160,title:`班级名称`,colKey:`name`},{ellipsis:!0,width:120,title:`班主任`,colKey:`leader`},{ellipsis:!0,width:300,title:`班级口号`,colKey:`slogan`},{ellipsis:!0,width:160,title:`创建时间`,colKey:`createtime`},{ellipsis:!0,width:140,title:`操作`,colKey:`actions`,align:`center`,fixed:`right`}],pagination:{current:1,pageSize:20,total:0},onPageChange(e,t){D.pagination.current=e.current,D.pagination.pageSize=e.pageSize,M()},defaultSelectedRowKeys:[],onSelectChange(e,t){D.defaultSelectedRowKeys=e},activeRowType:`multiple`});function k(){D.pagination.current=1,M()}function j(){Object.keys(m).forEach(e=>delete m[e]),D.pagination.current=1,M()}function M(){y.get(`/api/zone/mzl/class/select`,{...m,current:D.pagination.current,pageSize:D.pagination.pageSize}).then(e=>{D.data=e.data||[],D.pagination.total=e.total||0})}E({});let N={row:{},action:``,dialog:!1,dialog_detail:!1,submitCallback(e){P.action===`insert`?k():M(),Object.assign(P,N)}},P=E({...N});function F(){P.row={},P.action=`insert`,P.dialog=!0}function I(e){P.row=e,P.action=`update`,P.dialog=!0}function L(e){P.row=e,P.action=`detail`,P.dialog=!0}function R(e){y.post(`/api/zone/mzl/class/delete`,{id:e.id}).then(e=>{f.success(e.msg),k()})}function z(){let e=O.confirm({header:`确定删除这${D.defaultSelectedRowKeys.length>1?D.defaultSelectedRowKeys.length:``}条数据？`,body:`请谨慎操作`,confirmBtn:{theme:`danger`},onConfirm:({e:t})=>{e.hide(),R({id:D.defaultSelectedRowKeys.join(`,`)})}})}return(u,f)=>{let y=c,C=s,E=t,O=i,M=p,N=r,B=e;return v(),d(x,null,[h(n,_(b(D),{show_checkbox:!1}),{TableModelHeader:T(()=>[h(M,{ref:`formRef`,data:b(m),layout:`inline`,colon:``,onKeypress:S(k,[`enter`])},{default:T(()=>[h(C,{label:`班级名称`},{default:T(()=>[h(y,{modelValue:b(m).name,"onUpdate:modelValue":f[0]||=e=>b(m).name=e,clearable:``},null,8,[`modelValue`])]),_:1}),h(C,{label:`班主任`},{default:T(()=>[h(y,{modelValue:b(m).leader,"onUpdate:modelValue":f[1]||=e=>b(m).leader=e,clearable:``},null,8,[`modelValue`])]),_:1}),h(C,{label:`建档日期`},{default:T(()=>[h(E,{modelValue:b(m).createtime,"onUpdate:modelValue":f[2]||=e=>b(m).createtime=e,clearable:``},null,8,[`modelValue`])]),_:1}),h(C,null,{default:T(()=>[h(O,{onClick:k},{default:T(()=>[...f[4]||=[o(`查询`,-1)]]),_:1}),h(O,{theme:`default`,variant:`outline`,onClick:j},{default:T(()=>[...f[5]||=[o(`重置`,-1)]]),_:1})]),_:1}),h(C,{toright:``},{default:T(()=>[h(O,{theme:`primary`,onClick:F},{default:T(()=>[...f[6]||=[o(`新增`,-1)]]),_:1}),h(O,{theme:`danger`,onClick:z,disabled:!b(D).defaultSelectedRowKeys.length},{default:T(()=>[...f[7]||=[o(`删除`,-1)]]),_:1},8,[`disabled`])]),_:1})]),_:1},8,[`data`])]),actions:T(({row:e})=>[h(N,{theme:`primary`,onClick:t=>L(e)},{default:T(()=>[...f[8]||=[o(`详情`,-1)]]),_:1},8,[`onClick`]),h(N,{theme:`warning`,onClick:t=>I(e)},{default:T(()=>[...f[9]||=[o(`编辑`,-1)]]),_:1},8,[`onClick`]),h(B,{theme:`danger`,content:`确定删除【${e[b(D).rowName]}】？`,onConfirm:t=>R(e)},{default:T(()=>[h(N,{theme:`danger`},{default:T(()=>[...f[10]||=[o(`删除`,-1)]]),_:1})]),_:1},8,[`content`,`onConfirm`])]),_:1},16),l(` <t-form ref="formRef" :data="form" layout="inline" colon @keypress.enter="click_select">\r
		<t-form-item label="班级名称">\r
			<t-input v-model="form.name" clearable />\r
		</t-form-item>\r
		<t-form-item label="班主任">\r
			<t-input v-model="form.leader" clearable />\r
		</t-form-item>\r
		<t-form-item label="建档日期">\r
			<t-date-picker v-model="form.createtime" clearable />\r
		</t-form-item>\r
		<t-form-item>\r
			<t-button @click="click_select">查询</t-button>\r
			<t-button theme="default" variant="outline" @click="click_reset">重置</t-button>\r
		</t-form-item>\r
		<t-form-item toright>\r
			<t-button theme="primary" @click="click_insert">新增</t-button>\r
			<t-button theme="danger" @click="click_deletes" :disabled="!table.defaultSelectedRowKeys.length">删除</t-button>\r
		</t-form-item>\r
	</t-form>\r
\r
	<t-table\r
		:data="table.data"\r
		:columns="table.columns"\r
		:pagination="table.pagination"\r
		:onPageChange="table.onPageChange"\r
		activeRowType="multiple"\r
		v-model:activeRowKeys="table.activeRowKeys">\r
		<template #actions="{ row }">\r
			<t-link theme="primary" @click="click_detail(row)">详情</t-link>\r
			<t-link theme="warning" @click="click_update(row)">编辑</t-link>\r
			<t-popconfirm theme="danger" :content="\`确定删除【\${row[table.rowName]}】？\`" @confirm="click_delete(row)">\r
				<t-link theme="danger">删除</t-link>\r
			</t-popconfirm>\r
		</template></t-table\r
	> `),h(w,{visible:b(P).dialog,"onUpdate:visible":f[3]||=e=>b(P).dialog=e,width:450,header:{insert:`新增`,update:`${b(P).row[b(D).rowName]} - 编辑`,detail:`${b(P).row[b(D).rowName]} - 详情`}[b(P).action]},{default:T(()=>[h(A,a(g(b(P))),null,16)]),_:1},8,[`visible`,`header`])],64)}}};export{j as default};