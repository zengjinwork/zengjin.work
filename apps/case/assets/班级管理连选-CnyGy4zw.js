import{n as e,t}from"./TableModel-B5HVwHfU.js";import{t as n}from"./link-DWMfn-Ar.js";import{t as r}from"./popconfirm-D6Lq2ZNu.js";import{$r as i,Ai as a,D as o,Fi as s,Jr as c,N as l,O as u,Qr as d,Ui as f,Ur as p,V as m,Vr as h,Yr as g,_,da as v,f as y,gi as b,ni as x,ot as S,pi as C,si as w,w as T}from"./index-B93fTNeR.js";import E from"./班级管理_form-CsqC1GbA.js";var D={__name:`班级管理连选`,setup(D){C(()=>{A()});let O=s({}),k=s({data:[],rowKey:`id`,rowName:`name`,columns:[{ellipsis:!0,width:160,title:`班级名称`,colKey:`name`},{ellipsis:!0,width:120,title:`班主任`,colKey:`leader`},{ellipsis:!0,width:300,title:`班级口号`,colKey:`slogan`},{ellipsis:!0,width:160,title:`创建时间`,colKey:`createtime`},{ellipsis:!0,width:140,title:`操作`,colKey:`actions`,align:`center`,fixed:`right`}],pagination:{current:1,pageSize:20,total:0},onPageChange(e,t){k.pagination.current=e.current,k.pagination.pageSize=e.pageSize,M()},defaultSelectedRowKeys:[],onSelectChange(e,t){k.defaultSelectedRowKeys=e},activeRowType:`multiple`});function A(){k.pagination.current=1,M()}function j(){Object.keys(O).forEach(e=>delete O[e]),k.pagination.current=1,M()}function M(){_.get(`/api/zone/mzl/class/select`,{...O,current:k.pagination.current,pageSize:k.pagination.pageSize}).then(e=>{k.data=e.data||[],k.pagination.total=e.total||0})}s({});let N={row:{},action:``,dialog:!1,dialog_detail:!1,submitCallback(e){P.action===`insert`?A():M(),Object.assign(P,N)}},P=s({...N});function F(){P.row={},P.action=`insert`,P.dialog=!0}function I(e){P.row=e,P.action=`update`,P.dialog=!0}function L(e){P.row=e,P.action=`detail`,P.dialog=!0}function R(e){_.post(`/api/zone/mzl/class/delete`,{id:e.id}).then(e=>{m.success(e.msg),A()})}function z(){let e=T.confirm({header:`确定删除这${k.defaultSelectedRowKeys.length>1?k.defaultSelectedRowKeys.length:``}条数据？`,body:`请谨慎操作`,confirmBtn:{theme:`danger`},onConfirm:({e:t})=>{e.hide(),R({id:k.defaultSelectedRowKeys.join(`,`)})}})}return(s,m)=>{let _=l,C=u,T=e,D=S,M=o,N=n,B=r;return b(),g(p,null,[i(t,w(f(k),{show_checkbox:!1}),{TableModelHeader:a(()=>[i(M,{ref:`formRef`,data:f(O),layout:`inline`,colon:``,onKeypress:h(A,[`enter`])},{default:a(()=>[i(C,{label:`班级名称`},{default:a(()=>[i(_,{modelValue:f(O).name,"onUpdate:modelValue":m[0]||=e=>f(O).name=e,clearable:``},null,8,[`modelValue`])]),_:1}),i(C,{label:`班主任`},{default:a(()=>[i(_,{modelValue:f(O).leader,"onUpdate:modelValue":m[1]||=e=>f(O).leader=e,clearable:``},null,8,[`modelValue`])]),_:1}),i(C,{label:`建档日期`},{default:a(()=>[i(T,{modelValue:f(O).createtime,"onUpdate:modelValue":m[2]||=e=>f(O).createtime=e,clearable:``},null,8,[`modelValue`])]),_:1}),i(C,null,{default:a(()=>[i(D,{onClick:A},{default:a(()=>[...m[4]||=[d(`查询`,-1)]]),_:1}),i(D,{theme:`default`,variant:`outline`,onClick:j},{default:a(()=>[...m[5]||=[d(`重置`,-1)]]),_:1})]),_:1}),i(C,{toright:``},{default:a(()=>[i(D,{theme:`primary`,onClick:F},{default:a(()=>[...m[6]||=[d(`新增`,-1)]]),_:1}),i(D,{theme:`danger`,onClick:z,disabled:!f(k).defaultSelectedRowKeys.length},{default:a(()=>[...m[7]||=[d(`删除`,-1)]]),_:1},8,[`disabled`])]),_:1})]),_:1},8,[`data`])]),actions:a(({row:e})=>[i(N,{theme:`primary`,onClick:t=>L(e)},{default:a(()=>[...m[8]||=[d(`详情`,-1)]]),_:1},8,[`onClick`]),i(N,{theme:`warning`,onClick:t=>I(e)},{default:a(()=>[...m[9]||=[d(`编辑`,-1)]]),_:1},8,[`onClick`]),i(B,{theme:`danger`,content:`确定删除【${e[f(k).rowName]}】？`,onConfirm:t=>R(e)},{default:a(()=>[i(N,{theme:`danger`},{default:a(()=>[...m[10]||=[d(`删除`,-1)]]),_:1})]),_:1},8,[`content`,`onConfirm`])]),_:1},16),c(` <t-form ref="formRef" :data="form" layout="inline" colon @keypress.enter="click_select">\r
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
	> `),i(y,{visible:f(P).dialog,"onUpdate:visible":m[3]||=e=>f(P).dialog=e,width:450,header:{insert:`新增`,update:`${f(P).row[f(k).rowName]} - 编辑`,detail:`${f(P).row[f(k).rowName]} - 详情`}[f(P).action]},{default:a(()=>[i(E,v(x(f(P))),null,16)]),_:1},8,[`visible`,`header`])],64)}}};export{D as default};